#include "WindowsCddaReader.h"

#include "HostUtils.h"

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <exception>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <fcntl.h>
#include <io.h>
#include <windows.h>
#include <ntddcdrm.h>
#endif

namespace
{
constexpr std::uint32_t cddaRawSectorBytes = 2352;
constexpr std::uint32_t cddaLogicalSectorBytes = 2048;
constexpr std::uint32_t readBatchSectors = 16;
constexpr int readAttemptsPerBatchSize = 2;

#ifdef _WIN32
class ScopedHandle final
{
public:
    explicit ScopedHandle(HANDLE value) : handle(value) {}
    ~ScopedHandle()
    {
        if (handle != INVALID_HANDLE_VALUE)
            CloseHandle(handle);
    }

    ScopedHandle(const ScopedHandle&) = delete;
    ScopedHandle& operator=(const ScopedHandle&) = delete;
    ScopedHandle(ScopedHandle&& other) noexcept : handle(other.handle)
    {
        other.handle = INVALID_HANDLE_VALUE;
    }
    ScopedHandle& operator=(ScopedHandle&&) = delete;

    HANDLE get() const { return handle; }

private:
    HANDLE handle = INVALID_HANDLE_VALUE;
};

std::wstring normalizeDrivePath(const std::string& drive)
{
    if (drive.size() != 2 || drive[1] != ':'
        || ! ((drive[0] >= 'A' && drive[0] <= 'Z') || (drive[0] >= 'a' && drive[0] <= 'z')))
        throw std::runtime_error("audio_cd_invalid_drive");

    wchar_t letter = static_cast<wchar_t>(drive[0]);
    if (letter >= L'a' && letter <= L'z')
        letter = static_cast<wchar_t>(letter - L'a' + L'A');
    return std::wstring(L"\\\\.\\") + letter + L":";
}

ScopedHandle openDrive(const std::string& drive)
{
    const auto path = normalizeDrivePath(drive);
    ScopedHandle handle(CreateFileW(
        path.c_str(),
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE,
        nullptr,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        nullptr));
    if (handle.get() == INVALID_HANDLE_VALUE)
        throw std::runtime_error("audio_cd_open_failed_win32_" + std::to_string(GetLastError()));
    return handle;
}

std::uint32_t readBigEndianLba(const UCHAR address[4])
{
    return (static_cast<std::uint32_t>(address[0]) << 24u)
        | (static_cast<std::uint32_t>(address[1]) << 16u)
        | (static_cast<std::uint32_t>(address[2]) << 8u)
        | static_cast<std::uint32_t>(address[3]);
}

class WindowsCddaDevice final : public CddaDevice
{
public:
    explicit WindowsCddaDevice(const std::string& drive) : handle(openDrive(drive)) {}

    std::vector<CddaTrackInfo> readToc() override
    {
        CDROM_READ_TOC_EX request {};
        request.Format = CDROM_READ_TOC_EX_FORMAT_TOC;
        request.Msf = 0;
        request.SessionTrack = 0;

        CDROM_TOC toc {};
        DWORD bytesReturned = 0;
        if (! DeviceIoControl(
                handle.get(),
                IOCTL_CDROM_READ_TOC_EX,
                &request,
                sizeof(request),
                &toc,
                sizeof(toc),
                &bytesReturned,
                nullptr))
            throw std::runtime_error("audio_cd_read_toc_failed_win32_" + std::to_string(GetLastError()));

        if (toc.FirstTrack < 1 || toc.LastTrack < toc.FirstTrack)
            throw std::runtime_error("audio_cd_invalid_toc");

        const auto trackCount = static_cast<std::size_t>(toc.LastTrack - toc.FirstTrack + 1);
        if (trackCount == 0 || trackCount >= MAXIMUM_NUMBER_TRACKS)
            throw std::runtime_error("audio_cd_invalid_track_count");

        std::vector<CddaTrackInfo> tracks;
        tracks.reserve(trackCount);
        for (std::size_t index = 0; index < trackCount; ++index)
        {
            const auto& current = toc.TrackData[index];
            const auto& next = toc.TrackData[index + 1];
            const auto startLba = readBigEndianLba(current.Address);
            const auto endLba = readBigEndianLba(next.Address);
            if (endLba <= startLba)
                throw std::runtime_error("audio_cd_invalid_track_bounds");

            tracks.push_back({
                static_cast<int>(current.TrackNumber),
                startLba,
                endLba,
                (current.Control & 0x04u) == 0,
            });
        }
        return tracks;
    }

    std::vector<std::uint8_t> readAudioSectors(
        std::uint32_t startLba,
        std::uint32_t sectorCount) override
    {
        if (sectorCount == 0 || sectorCount > readBatchSectors)
            throw std::runtime_error("audio_cd_invalid_sector_count");

        RAW_READ_INFO request {};
        request.DiskOffset.QuadPart = static_cast<LONGLONG>(startLba) * cddaLogicalSectorBytes;
        request.SectorCount = sectorCount;
        request.TrackMode = CDDA;

        std::vector<std::uint8_t> raw(sectorCount * cddaRawSectorBytes);
        DWORD bytesReturned = 0;
        if (! DeviceIoControl(
                handle.get(),
                IOCTL_CDROM_RAW_READ,
                &request,
                sizeof(request),
                raw.data(),
                static_cast<DWORD>(raw.size()),
                &bytesReturned,
                nullptr))
            throw std::runtime_error("audio_cd_raw_read_failed_win32_" + std::to_string(GetLastError()));
        if (bytesReturned != raw.size())
            throw std::runtime_error("audio_cd_short_raw_read");
        return raw;
    }

private:
    ScopedHandle handle;
};
#endif

std::unique_ptr<CddaDevice> createPlatformDevice(const std::string& drive)
{
#ifdef _WIN32
    return std::make_unique<WindowsCddaDevice>(drive);
#else
    (void) drive;
    throw std::runtime_error("audio_cd_windows_backend_unavailable");
#endif
}

std::vector<float> convertLittleEndianCddaToFloat(const std::vector<std::uint8_t>& raw)
{
    if (raw.empty() || (raw.size() % 2u) != 0)
        throw std::runtime_error("audio_cd_unaligned_pcm");

    std::vector<float> samples(raw.size() / 2u);
    for (std::size_t index = 0; index < samples.size(); ++index)
    {
        const auto offset = index * 2u;
        const auto sample = static_cast<std::int16_t>(
            static_cast<std::uint16_t>(raw[offset])
            | (static_cast<std::uint16_t>(raw[offset + 1]) << 8u));
        samples[index] = static_cast<float>(sample) / 32768.0f;
    }
    return samples;
}

std::vector<std::uint8_t> readValidatedAudioSectors(
    CddaDevice& device,
    std::uint32_t startLba,
    std::uint32_t sectorCount)
{
    std::exception_ptr lastError;
    for (int attempt = 0; attempt < readAttemptsPerBatchSize; ++attempt)
    {
        try
        {
            auto raw = device.readAudioSectors(startLba, sectorCount);
            const auto expectedBytes = static_cast<std::size_t>(sectorCount) * cddaRawSectorBytes;
            if (raw.size() != expectedBytes)
                throw std::runtime_error("audio_cd_short_raw_read");
            return raw;
        }
        catch (...)
        {
            lastError = std::current_exception();
        }
    }

    if (lastError)
        std::rethrow_exception(lastError);
    throw std::runtime_error("audio_cd_raw_read_failed");
}

void writeTrackJson(const std::vector<CddaTrackInfo>& tracks)
{
    std::string json = "{\"tracks\":[";
    for (std::size_t index = 0; index < tracks.size(); ++index)
    {
        if (index > 0)
            json += ',';
        const auto& track = tracks[index];
        json += "{\"index\":" + std::to_string(track.number)
            + ",\"startLba\":" + std::to_string(track.startLba)
            + ",\"endLba\":" + std::to_string(track.endLba)
            + ",\"audio\":" + (track.audio ? "true" : "false") + '}';
    }
    json += "]}";
    writeJsonLine(json);
}
} // namespace

WindowsCddaReader::WindowsCddaReader(DeviceFactory factory)
    : deviceFactory(factory ? std::move(factory) : DeviceFactory(createPlatformDevice))
{
}

std::vector<CddaTrackInfo> WindowsCddaReader::inspectDisc(const std::string& drive) const
{
    auto device = deviceFactory(drive);
    if (! device)
        throw std::runtime_error("audio_cd_device_factory_failed");
    return device->readToc();
}

void WindowsCddaReader::streamTrackTo(
    const std::string& drive,
    int trackNumber,
    const PcmSink& sink) const
{
    if (! sink)
        throw std::runtime_error("audio_cd_pcm_sink_required");
    auto device = deviceFactory(drive);
    if (! device)
        throw std::runtime_error("audio_cd_device_factory_failed");
    const auto tracks = device->readToc();
    const auto found = std::find_if(tracks.begin(), tracks.end(), [trackNumber] (const auto& track)
    {
        return track.number == trackNumber;
    });
    if (found == tracks.end())
        throw std::runtime_error("audio_cd_track_not_found");
    if (! found->audio)
        throw std::runtime_error("audio_cd_track_is_data");

    auto currentLba = found->startLba;
    auto preferredBatchSectors = readBatchSectors;
    while (currentLba < found->endLba)
    {
        const auto sectorCount = std::min(preferredBatchSectors, found->endLba - currentLba);
        std::vector<std::uint8_t> raw;
        try
        {
            raw = readValidatedAudioSectors(*device, currentLba, sectorCount);
        }
        catch (...)
        {
            if (sectorCount == 1)
                throw;
            preferredBatchSectors = std::max<std::uint32_t>(1, sectorCount / 2);
            continue;
        }
        sink(convertLittleEndianCddaToFloat(raw));
        currentLba += sectorCount;
    }
}

int WindowsCddaReader::writeToc(const std::string& drive) const
{
    writeTrackJson(inspectDisc(drive));
    return 0;
}

int WindowsCddaReader::writeCapabilities() const
{
#ifdef _WIN32
    writeJsonLine("{\"windowsNativeCdda\":true}");
    return 0;
#else
    writeJsonLine("{\"windowsNativeCdda\":false}");
    return 1;
#endif
}

int WindowsCddaReader::streamTrack(const std::string& drive, int trackNumber) const
{
#ifdef _WIN32
    if (_setmode(_fileno(stdout), _O_BINARY) == -1)
        throw std::runtime_error("audio_cd_stdout_binary_mode_failed");
#endif
    streamTrackTo(drive, trackNumber, [] (const std::vector<float>& samples)
    {
        const auto written = std::fwrite(samples.data(), sizeof(float), samples.size(), stdout);
        if (written != samples.size())
            throw std::runtime_error("audio_cd_stdout_write_failed");
    });
    std::fflush(stdout);
    return 0;
}
