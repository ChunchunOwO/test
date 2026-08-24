#include "WindowsCddaReader.h"

#include <cmath>
#include <cstdint>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace
{
constexpr std::uint32_t rawSectorBytes = 2352;

struct SimulatedDiscState
{
    std::vector<std::pair<std::uint32_t, std::uint32_t>> reads;
    std::uint32_t maximumBatchSectors = 16;
    int transientFailuresRemaining = 0;
};

class SimulatedCddaDevice final : public CddaDevice
{
public:
    explicit SimulatedCddaDevice(std::shared_ptr<SimulatedDiscState> state) : state(std::move(state)) {}

    std::vector<CddaTrackInfo> readToc() override
    {
        return {
            {1, 0, 18, true},
            {2, 18, 24, false},
            {3, 24, 25, true},
        };
    }

    std::vector<std::uint8_t> readAudioSectors(
        std::uint32_t startLba,
        std::uint32_t sectorCount) override
    {
        state->reads.emplace_back(startLba, sectorCount);
        if (state->transientFailuresRemaining > 0)
        {
            --state->transientFailuresRemaining;
            throw std::runtime_error("audio_cd_simulated_transient_read_failure");
        }
        if (sectorCount > state->maximumBatchSectors)
            throw std::runtime_error("audio_cd_simulated_batch_too_large");
        std::vector<std::uint8_t> raw(static_cast<std::size_t>(sectorCount) * rawSectorBytes);
        for (std::size_t index = 0; index < raw.size(); index += 4)
        {
            raw[index] = 0x00;
            raw[index + 1] = 0x80;
            raw[index + 2] = 0xff;
            raw[index + 3] = 0x7f;
        }
        return raw;
    }

private:
    std::shared_ptr<SimulatedDiscState> state;
};

void require(bool condition, const std::string& message)
{
    if (! condition)
        throw std::runtime_error(message);
}

template <typename Callback>
void requireThrows(Callback&& callback, const std::string& expected)
{
    try
    {
        callback();
    }
    catch (const std::exception& error)
    {
        require(std::string(error.what()) == expected, "unexpected error: " + std::string(error.what()));
        return;
    }
    throw std::runtime_error("expected error: " + expected);
}
} // namespace

int main()
{
    try
    {
        const auto state = std::make_shared<SimulatedDiscState>();
        WindowsCddaReader reader([state] (const std::string& drive)
        {
            require(drive == "D:", "simulated drive id was not forwarded");
            return std::make_unique<SimulatedCddaDevice>(state);
        });

        const auto tracks = reader.inspectDisc("D:");
        require(tracks.size() == 3, "simulated TOC track count mismatch");
        require(tracks[0].audio && ! tracks[1].audio && tracks[2].audio,
            "simulated mixed-mode track flags mismatch");

        std::vector<float> pcm;
        reader.streamTrackTo("D:", 1, [&pcm] (const std::vector<float>& chunk)
        {
            pcm.insert(pcm.end(), chunk.begin(), chunk.end());
        });
        require(state->reads == std::vector<std::pair<std::uint32_t, std::uint32_t>>({{0, 16}, {16, 2}}),
            "CDDA reader did not preserve bounded sector batches");
        require(pcm.size() == 18u * rawSectorBytes / 2u, "PCM sample count mismatch");
        require(std::abs(pcm[0] + 1.0f) < 0.000001f, "negative PCM sample conversion mismatch");
        require(std::abs(pcm[1] - (32767.0f / 32768.0f)) < 0.000001f,
            "positive PCM sample conversion mismatch");

        const auto limitedState = std::make_shared<SimulatedDiscState>();
        limitedState->maximumBatchSectors = 4;
        WindowsCddaReader limitedReader([limitedState] (const std::string&)
        {
            return std::make_unique<SimulatedCddaDevice>(limitedState);
        });
        std::size_t limitedSampleCount = 0;
        limitedReader.streamTrackTo("D:", 1, [&limitedSampleCount] (const std::vector<float>& chunk)
        {
            limitedSampleCount += chunk.size();
        });
        require(limitedSampleCount == 18u * rawSectorBytes / 2u,
            "adaptive batch fallback lost PCM samples");
        require(limitedState->reads == std::vector<std::pair<std::uint32_t, std::uint32_t>>({
            {0, 16}, {0, 16}, {0, 8}, {0, 8}, {0, 4}, {4, 4}, {8, 4}, {12, 4}, {16, 2},
        }), "adaptive batch fallback did not retain the discovered drive limit");

        const auto transientState = std::make_shared<SimulatedDiscState>();
        transientState->transientFailuresRemaining = 1;
        WindowsCddaReader transientReader([transientState] (const std::string&)
        {
            return std::make_unique<SimulatedCddaDevice>(transientState);
        });
        transientReader.streamTrackTo("D:", 1, [] (const std::vector<float>&) {});
        require(transientState->reads == std::vector<std::pair<std::uint32_t, std::uint32_t>>({
            {0, 16}, {0, 16}, {16, 2},
        }), "transient sector failure was not retried in place");

        requireThrows([&] { reader.streamTrackTo("D:", 2, [] (const auto&) {}); },
            "audio_cd_track_is_data");
        requireThrows([&] { reader.streamTrackTo("D:", 99, [] (const auto&) {}); },
            "audio_cd_track_not_found");

        std::cout << "[PASS] simulated Windows CDDA TOC, mixed-mode filtering, adaptive reads, and PCM conversion\n";
        return 0;
    }
    catch (const std::exception& error)
    {
        std::cerr << "[FAIL] " << error.what() << '\n';
        return 1;
    }
}
