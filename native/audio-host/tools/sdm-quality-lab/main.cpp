#include "NativeFormatProcessor.h"

#include <algorithm>
#include <bit>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>

namespace
{
constexpr double pi = 3.14159265358979323846;
constexpr double signalFrequency = 1'000.0;
constexpr double signalAmplitude = 0.1;
constexpr double analysisCutoffHz = 20'000.0;

struct ProfileSpec
{
    const char* name;
    echo::SdmQualityProfile profile;
};

struct RateSpec
{
    const char* name;
    int transportSampleRate;
};

struct InterpolationSpec
{
    const char* name;
    echo::SdmInterpolationMode mode;
};

struct Measurement
{
    std::string rate;
    int transportSampleRate = 0;
    int nativeSampleRate = 0;
    std::string profile;
    std::string interpolation;
    int modulatorOrder = 0;
    double ntfPeakGain = 0.0;
    double profileHeadroomDb = 0.0;
    double inBandResidualDb = 0.0;
    double signalOneDensity = 0.0;
    double idlePatternRatio = 0.0;
    double peakFeedbackState = 0.0;
    std::uint64_t stabilityRecoveries = 0;
    double processingMs = 0.0;
    double realtimeRatio = 0.0;
    std::uint64_t checksum = 0;
    bool deterministic = false;
};

std::vector<float> createSignal(int transportSampleRate, int frames)
{
    std::vector<float> signal(static_cast<std::size_t>(frames));
    for (int frame = 0; frame < frames; ++frame)
    {
        signal[static_cast<std::size_t>(frame)] = static_cast<float>(
            std::sin(2.0 * pi * signalFrequency * static_cast<double>(frame)
                / static_cast<double>(transportSampleRate))
            * signalAmplitude);
    }
    return signal;
}

std::uint64_t checksum(const std::vector<std::uint8_t>& bytes)
{
    std::uint64_t hash = 1469598103934665603ull;
    for (const auto byte : bytes)
    {
        hash ^= byte;
        hash *= 1099511628211ull;
    }
    return hash;
}

double oneDensity(
    const std::vector<std::uint8_t>& output,
    int startTransportFrame,
    int frameCount)
{
    const int endFrame = std::min(
        startTransportFrame + frameCount,
        static_cast<int>(output.size() / 2u));
    std::uint64_t ones = 0;
    std::uint64_t bits = 0;
    for (int frame = std::max(0, startTransportFrame); frame < endFrame; ++frame)
    {
        const auto base = static_cast<std::size_t>(frame * 2);
        ones += static_cast<std::uint64_t>(std::popcount(output[base]));
        ones += static_cast<std::uint64_t>(std::popcount(output[base + 1]));
        bits += 16;
    }
    return bits > 0 ? static_cast<double>(ones) / static_cast<double>(bits) : 0.0;
}

double idlePatternRatio(const std::vector<std::uint8_t>& output, int startTransportFrame)
{
    const int totalFrames = static_cast<int>(output.size() / 2u);
    int matchingFrames = 0;
    int measuredFrames = 0;
    for (int frame = std::max(0, startTransportFrame); frame < totalFrames; ++frame)
    {
        const auto base = static_cast<std::size_t>(frame * 2);
        matchingFrames += output[base] == 0x69u && output[base + 1] == 0x69u ? 1 : 0;
        ++measuredFrames;
    }
    return measuredFrames > 0
        ? static_cast<double>(matchingFrames) / static_cast<double>(measuredFrames)
        : 0.0;
}

double measureInBandResidualDb(
    const std::vector<float>& input,
    const std::vector<std::uint8_t>& output,
    const echo::SdmProcessorConfig& configuration)
{
    const int transportSampleRate = configuration.transportSampleRate;
    const int nativeSampleRate = transportSampleRate * 16;
    const int rateScale = std::max(1, transportSampleRate / 176'400);
    const int decimation = 64 * rateScale;
    const int tapCount = 510 * rateScale + 1;
    const int center = (tapCount - 1) / 2;

    std::vector<double> residual(input.size() * 16u, 0.0);
    std::size_t bitIndex = 0;
    for (std::size_t frame = 0; frame < input.size(); ++frame)
    {
        const double transitionGain = std::min(
            1.0,
            static_cast<double>(frame + 1u)
                / static_cast<double>(std::max(1, configuration.transitionRampFrames)));
        for (int bit = 0; bit < 16; ++bit)
        {
            const double bitTime =
                (static_cast<double>(frame) - 1.0 + static_cast<double>(bit + 1) / 16.0)
                / static_cast<double>(transportSampleRate);
            const double ideal = std::sin(2.0 * pi * signalFrequency * bitTime)
                * signalAmplitude
                * configuration.profileHeadroomGain
                * transitionGain;
            const auto byte = output[frame * 2u + static_cast<std::size_t>(bit / 8)];
            const double actual = (byte & static_cast<std::uint8_t>(1u << (bit % 8))) != 0u ? 1.0 : -1.0;
            residual[bitIndex++] = actual - ideal;
        }
    }

    std::vector<double> taps(static_cast<std::size_t>(tapCount), 0.0);
    const double normalizedCutoff = analysisCutoffHz / static_cast<double>(nativeSampleRate);
    double tapSum = 0.0;
    for (int tap = 0; tap < tapCount; ++tap)
    {
        const int offset = tap - center;
        const double sinc = offset == 0
            ? 2.0 * normalizedCutoff
            : std::sin(2.0 * pi * normalizedCutoff * static_cast<double>(offset))
                / (pi * static_cast<double>(offset));
        const double window = 0.5 - 0.5 * std::cos(
            2.0 * pi * static_cast<double>(tap) / static_cast<double>(tapCount - 1));
        taps[static_cast<std::size_t>(tap)] = sinc * window;
        tapSum += taps[static_cast<std::size_t>(tap)];
    }
    for (auto& tap : taps)
        tap /= tapSum;

    const int firstBit = nativeSampleRate / 50;
    const int lastBit = std::min(nativeSampleRate / 10, static_cast<int>(residual.size()) - center);
    double sumSquares = 0.0;
    int sampleCount = 0;
    for (int outputBit = firstBit; outputBit < lastBit; outputBit += decimation)
    {
        if (outputBit - center < 0 || outputBit + center >= static_cast<int>(residual.size()))
            continue;
        double filtered = 0.0;
        for (int tap = 0; tap < tapCount; ++tap)
        {
            filtered += residual[static_cast<std::size_t>(outputBit + tap - center)]
                * taps[static_cast<std::size_t>(tap)];
        }
        sumSquares += filtered * filtered;
        ++sampleCount;
    }
    const double rms = sampleCount > 0
        ? std::sqrt(sumSquares / static_cast<double>(sampleCount))
        : 1.0;
    return 20.0 * std::log10(std::max(rms, 1.0e-15));
}

Measurement measure(
    const RateSpec& rate,
    const ProfileSpec& profile,
    const InterpolationSpec& interpolation)
{
    const int frames = rate.transportSampleRate / 8;
    const auto input = createSignal(rate.transportSampleRate, frames);
    echo::SdmProcessor processor;
    processor.configure(1, profile.profile, rate.transportSampleRate, interpolation.mode);
    const auto configuration = processor.configuration();

    const auto startedAt = std::chrono::steady_clock::now();
    const auto output = processor.processNativeDsd(input.data(), frames);
    const auto endedAt = std::chrono::steady_clock::now();
    const double processingMs = std::chrono::duration<double, std::milli>(endedAt - startedAt).count();

    echo::SdmProcessor deterministicProcessor;
    deterministicProcessor.configure(1, profile.profile, rate.transportSampleRate, interpolation.mode);
    const auto repeatedOutput = deterministicProcessor.processNativeDsd(input.data(), frames);

    echo::SdmProcessor idleProcessor;
    idleProcessor.configure(1, profile.profile, rate.transportSampleRate, interpolation.mode);
    const int idleFrames = rate.transportSampleRate / 20;
    std::vector<float> silence(static_cast<std::size_t>(idleFrames), 0.0f);
    const auto idleOutput = idleProcessor.processNativeDsd(silence.data(), idleFrames);

    Measurement result;
    result.rate = rate.name;
    result.transportSampleRate = rate.transportSampleRate;
    result.nativeSampleRate = rate.transportSampleRate * 16;
    result.profile = profile.name;
    result.interpolation = interpolation.name;
    result.modulatorOrder = processor.modulatorOrder();
    result.ntfPeakGain = processor.ntfPeakGain();
    result.profileHeadroomDb = -20.0 * std::log10(configuration.profileHeadroomGain);
    result.inBandResidualDb = measureInBandResidualDb(input, output, configuration);
    result.signalOneDensity = oneDensity(output, rate.transportSampleRate / 20, rate.transportSampleRate / 20);
    result.idlePatternRatio = idlePatternRatio(idleOutput, rate.transportSampleRate / 40);
    result.peakFeedbackState = processor.peakFeedbackState();
    result.stabilityRecoveries = processor.stabilityRecoveryCount();
    result.processingMs = processingMs;
    result.realtimeRatio = processingMs / 1'000.0 / (static_cast<double>(frames) / rate.transportSampleRate);
    result.checksum = checksum(output);
    result.deterministic = output == repeatedOutput;
    return result;
}

void writeMeasurement(const Measurement& measurement, bool last)
{
    std::cout << "    {\n"
              << "      \"rate\": \"" << measurement.rate << "\",\n"
              << "      \"transportSampleRate\": " << measurement.transportSampleRate << ",\n"
              << "      \"nativeSampleRate\": " << measurement.nativeSampleRate << ",\n"
              << "      \"profile\": \"" << measurement.profile << "\",\n"
              << "      \"interpolation\": \"" << measurement.interpolation << "\",\n"
              << "      \"modulatorOrder\": " << measurement.modulatorOrder << ",\n"
              << "      \"ntfPeakGain\": " << measurement.ntfPeakGain << ",\n"
              << "      \"profileHeadroomDb\": " << measurement.profileHeadroomDb << ",\n"
              << "      \"inBandResidualDb\": " << measurement.inBandResidualDb << ",\n"
              << "      \"signalOneDensity\": " << measurement.signalOneDensity << ",\n"
              << "      \"idlePatternRatio\": " << measurement.idlePatternRatio << ",\n"
              << "      \"peakFeedbackState\": " << measurement.peakFeedbackState << ",\n"
              << "      \"stabilityRecoveries\": " << measurement.stabilityRecoveries << ",\n"
              << "      \"processingMs\": " << measurement.processingMs << ",\n"
              << "      \"realtimeRatio\": " << measurement.realtimeRatio << ",\n"
              << "      \"checksumFnv1a64\": \"" << std::hex << measurement.checksum << std::dec << "\",\n"
              << "      \"deterministic\": " << (measurement.deterministic ? "true" : "false") << "\n"
              << "    }" << (last ? "\n" : ",\n");
}
} // namespace

int main()
{
    const std::vector<RateSpec> rates {
        { "DSD64", 176'400 },
        { "DSD128", 352'800 },
        { "DSD256", 705'600 },
        { "DSD512", 1'411'200 },
    };
    const std::vector<ProfileSpec> profiles {
        { "safe", echo::SdmQualityProfile::Safe },
        { "hifi", echo::SdmQualityProfile::Hifi },
        { "reference", echo::SdmQualityProfile::Reference },
        { "insane", echo::SdmQualityProfile::Insane },
    };
    const std::vector<InterpolationSpec> interpolations {
        { "linear", echo::SdmInterpolationMode::Linear },
        { "smoothstep-experimental", echo::SdmInterpolationMode::SmoothstepExperimental },
    };

    std::vector<Measurement> measurements;
    measurements.reserve(rates.size() * profiles.size() * interpolations.size());
    for (const auto& rate : rates)
    {
        for (const auto& profile : profiles)
        {
            for (const auto& interpolation : interpolations)
                measurements.push_back(measure(rate, profile, interpolation));
        }
    }

    std::cout << std::fixed << std::setprecision(6)
              << "{\n"
              << "  \"schemaVersion\": 1,\n"
              << "  \"generator\": \"echo-sdm-quality-lab\",\n"
              << "  \"analysisBandHz\": 20000,\n"
              << "  \"stimulus\": { \"type\": \"sine\", \"frequencyHz\": 1000, \"amplitude\": 0.1, \"durationSeconds\": 0.125 },\n"
              << "  \"measurementOnly\": true,\n"
              << "  \"hardwareProof\": false,\n"
              << "  \"measurements\": [\n";
    for (std::size_t index = 0; index < measurements.size(); ++index)
        writeMeasurement(measurements[index], index + 1u == measurements.size());
    std::cout << "  ]\n}\n";
    return 0;
}
