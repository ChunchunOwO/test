#include "LevelMeterProcessor.h"

#include <algorithm>
#include <cmath>

namespace echo
{
namespace
{
constexpr float silenceDb = -60.0f;
constexpr double pi = 3.14159265358979323846;
constexpr double spectrumTargetSampleRate = 48000.0;
constexpr double spectrumMinFrequencyHz = 40.0;
constexpr double spectrumMaxFrequencyHz = 18000.0;
constexpr float spectrumFloorDb = -72.0f;
constexpr float spectrumCeilingDb = -8.0f;
} // namespace

float LevelMeterProcessor::sanitizeDb(float db)
{
    if (! std::isfinite(db))
        return silenceDb;

    return std::max(silenceDb, std::min(0.0f, db));
}

float LevelMeterProcessor::sanitize(float value)
{
    return std::isfinite(value) ? value : 0.0f;
}

LevelMeterProcessor::LevelMeterProcessor()
{
    intervalMs.store(0, std::memory_order_release);
}

void LevelMeterProcessor::prepare(double sampleRateIn, int maximumBlockSize, int channelCountIn)
{
    (void) maximumBlockSize;

    sampleRate = sampleRateIn > 0.0 ? sampleRateIn : 44100.0;
    channelCount = std::max(1, channelCountIn);

    peakSquares.assign(static_cast<size_t>(channelCount), 0.0f);
    rmsSquares.assign(static_cast<size_t>(channelCount), 0.0f);
    callbackSnapshot.peakDb.assign(static_cast<size_t>(channelCount), silenceDb);
    callbackSnapshot.rmsDb.assign(static_cast<size_t>(channelCount), silenceDb);
    callbackSnapshot.visualSpectrum.assign(levelMeterVisualSpectrumBucketCount, 0.0f);

    spectrumDecimationFactor = std::max(1, static_cast<int>(std::floor(sampleRate / spectrumTargetSampleRate)));
    spectrumSampleRate = sampleRate / static_cast<double>(spectrumDecimationFactor);
    spectrumWindowNormalization = 0.0f;
    for (size_t sample = 0; sample < spectrumWindow.size(); ++sample)
    {
        const double phase = spectrumWindow.size() > 1
            ? static_cast<double>(sample) / static_cast<double>(spectrumWindow.size() - 1)
            : 0.0;
        spectrumWindow[sample] = static_cast<float>(0.5 - 0.5 * std::cos(2.0 * pi * phase));
        spectrumWindowNormalization += spectrumWindow[sample];
    }
    spectrumWindowNormalization = std::max(1.0f, spectrumWindowNormalization);

    const double maxFrequency = std::max(
        spectrumMinFrequencyHz,
        std::min(spectrumMaxFrequencyHz, spectrumSampleRate * 0.45));
    const double frequencyRatio = maxFrequency / spectrumMinFrequencyHz;
    for (size_t bucket = 0; bucket < spectrumCoefficients.size(); ++bucket)
    {
        const double position = spectrumCoefficients.size() > 1
            ? static_cast<double>(bucket) / static_cast<double>(spectrumCoefficients.size() - 1)
            : 0.0;
        const double requestedFrequency = spectrumMinFrequencyHz * std::pow(frequencyRatio, position);
        const double bin = std::max(1.0, std::round(
            requestedFrequency * static_cast<double>(spectrumWindow.size()) / spectrumSampleRate));
        spectrumCoefficients[bucket] = static_cast<float>(
            2.0 * std::cos(2.0 * pi * bin / static_cast<double>(spectrumWindow.size())));
    }

    reset();
}

void LevelMeterProcessor::reset()
{
    std::fill(peakSquares.begin(), peakSquares.end(), 0.0f);
    std::fill(rmsSquares.begin(), rmsSquares.end(), 0.0f);
    resetVisualSpectrumState();
    spectrumWasEnabled = visualSpectrumEnabled.load(std::memory_order_acquire);
    samplesSinceReport = 0.0;
}

void LevelMeterProcessor::resetVisualSpectrumState()
{
    std::fill(spectrumSamples.begin(), spectrumSamples.end(), 0.0f);
    std::fill(smoothedSpectrum.begin(), smoothedSpectrum.end(), 0.0f);
    std::fill(callbackSnapshot.visualSpectrum.begin(), callbackSnapshot.visualSpectrum.end(), 0.0f);
    callbackSnapshot.visualSpectrumReady = false;
    spectrumWriteIndex = 0;
    spectrumSampleCount = 0;
    spectrumDecimationCountdown = 0;
}

void LevelMeterProcessor::computeVisualSpectrum()
{
    if (spectrumSampleCount < spectrumWindow.size())
    {
        callbackSnapshot.visualSpectrumReady = false;
        return;
    }

    for (size_t bucket = 0; bucket < spectrumCoefficients.size(); ++bucket)
    {
        const float coefficient = spectrumCoefficients[bucket];
        float q1 = 0.0f;
        float q2 = 0.0f;
        for (size_t sample = 0; sample < spectrumWindow.size(); ++sample)
        {
            const size_t sampleIndex = (spectrumWriteIndex + sample) % spectrumSamples.size();
            const float value = spectrumSamples[sampleIndex] * spectrumWindow[sample];
            const float q0 = value + coefficient * q1 - q2;
            q2 = q1;
            q1 = q0;
        }

        const float power = std::max(0.0f, q1 * q1 + q2 * q2 - coefficient * q1 * q2);
        const float magnitude = 2.0f * std::sqrt(power) / spectrumWindowNormalization;
        const float magnitudeDb = magnitude > 0.0f ? 20.0f * std::log10(magnitude) : spectrumFloorDb;
        const float unit = std::max(0.0f, std::min(
            1.0f,
            (magnitudeDb - spectrumFloorDb) / (spectrumCeilingDb - spectrumFloorDb)));
        const float shaped = std::pow(unit, 1.25f);
        const float smoothing = shaped > smoothedSpectrum[bucket] ? 0.55f : 0.2f;
        smoothedSpectrum[bucket] += (shaped - smoothedSpectrum[bucket]) * smoothing;
        callbackSnapshot.visualSpectrum[bucket] = sanitize(smoothedSpectrum[bucket]);
    }
    callbackSnapshot.visualSpectrumReady = true;
}

void LevelMeterProcessor::processBlock(echo::FloatAudioBuffer& buffer, int startSample, int numSamples)
{
    const int interval = intervalMs.load(std::memory_order_acquire);
    if (interval <= 0 || numSamples <= 0)
        return;

    const int ch = std::min(buffer.getNumChannels(), channelCount);
    if (ch <= 0)
        return;

    const bool spectrumEnabled = visualSpectrumEnabled.load(std::memory_order_acquire);
    if (spectrumEnabled != spectrumWasEnabled)
    {
        resetVisualSpectrumState();
        spectrumWasEnabled = spectrumEnabled;
    }

    const double intervalSamples = sampleRate * static_cast<double>(interval) / 1000.0;
    if (intervalSamples <= 0.0)
        return;

    for (int channel = 0; channel < ch; ++channel)
    {
        const float* src = buffer.getReadPointer(channel, startSample);
        if (src == nullptr)
            continue;

        const size_t chIdx = static_cast<size_t>(channel);

        for (int sample = 0; sample < numSamples; ++sample)
        {
            const float value = src[sample];
            const float square = sanitize(value * value);

            if (square > peakSquares[chIdx])
                peakSquares[chIdx] = square;

            rmsSquares[chIdx] += square;
        }
    }

    if (spectrumEnabled)
    {
        for (int sample = 0; sample < numSamples; ++sample)
        {
            if (spectrumDecimationCountdown > 0)
            {
                --spectrumDecimationCountdown;
                continue;
            }

            float mixedSample = 0.0f;
            int mixedChannels = 0;
            for (int channel = 0; channel < ch; ++channel)
            {
                const float* src = buffer.getReadPointer(channel, startSample);
                if (src == nullptr)
                    continue;
                mixedSample += sanitize(src[sample]);
                ++mixedChannels;
            }
            if (mixedChannels > 0)
                mixedSample /= static_cast<float>(mixedChannels);

            spectrumSamples[spectrumWriteIndex] = mixedSample;
            spectrumWriteIndex = (spectrumWriteIndex + 1) % spectrumSamples.size();
            spectrumSampleCount = std::min(spectrumSampleCount + 1, spectrumSamples.size());
            spectrumDecimationCountdown = spectrumDecimationFactor - 1;
        }
    }

    samplesSinceReport += static_cast<double>(numSamples);

    if (samplesSinceReport >= intervalSamples && callback)
    {
        callbackSnapshot.timestampMs = samplesSinceReport * 1000.0 / sampleRate;
        callbackSnapshot.peakDb.resize(static_cast<size_t>(ch));
        callbackSnapshot.rmsDb.resize(static_cast<size_t>(ch));

        for (int channel = 0; channel < ch; ++channel)
        {
            const size_t chIdx = static_cast<size_t>(channel);

            const float peakDb = peakSquares[chIdx] > 0.0f
                ? 10.0f * std::log10(peakSquares[chIdx])
                : silenceDb;
            callbackSnapshot.peakDb[chIdx] = sanitizeDb(peakDb);

            const float meanSquare = samplesSinceReport > 0.0
                ? rmsSquares[chIdx] / static_cast<float>(samplesSinceReport)
                : 0.0f;
            const float rmsDb = meanSquare > 0.0f
                ? 10.0f * std::log10(meanSquare)
                : silenceDb;
            callbackSnapshot.rmsDb[chIdx] = sanitizeDb(rmsDb);
        }

        if (spectrumEnabled)
            computeVisualSpectrum();
        else
            callbackSnapshot.visualSpectrumReady = false;

        callback(callbackSnapshot);

        std::fill(peakSquares.begin(), peakSquares.end(), 0.0f);
        std::fill(rmsSquares.begin(), rmsSquares.end(), 0.0f);
        samplesSinceReport = 0.0;
    }
}

void LevelMeterProcessor::setIntervalMs(int ms)
{
    const int clamped = std::max(0, std::min(levelMeterMaxIntervalMs, ms));
    intervalMs.store(clamped, std::memory_order_release);
}

void LevelMeterProcessor::setVisualSpectrumEnabled(bool enabled)
{
    visualSpectrumEnabled.store(enabled, std::memory_order_release);
}

void LevelMeterProcessor::setCallback(Callback callbackIn)
{
    callback = std::move(callbackIn);
}

int LevelMeterProcessor::getIntervalMs() const
{
    return intervalMs.load(std::memory_order_acquire);
}

bool LevelMeterProcessor::isVisualSpectrumEnabled() const
{
    return visualSpectrumEnabled.load(std::memory_order_acquire);
}

bool LevelMeterProcessor::isEnabled() const
{
    return intervalMs.load(std::memory_order_acquire) > 0;
}
} // namespace echo
