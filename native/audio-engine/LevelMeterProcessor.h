#pragma once

#include "buffer.h"

#include <array>
#include <atomic>
#include <functional>
#include <vector>

namespace echo
{
constexpr int levelMeterMaxIntervalMs = 5000;
constexpr float levelMeterMinDb = -60.0f;
constexpr size_t levelMeterVisualSpectrumBucketCount = 32;

struct LevelMeterSnapshot
{
    std::vector<float> peakDb;
    std::vector<float> rmsDb;
    std::vector<float> visualSpectrum;
    bool visualSpectrumReady = false;
    double timestampMs = 0.0;
};

class LevelMeterProcessor
{
public:
    using Callback = std::function<void(const LevelMeterSnapshot&)>;

    LevelMeterProcessor();

    void prepare(double sampleRate, int maximumBlockSize, int channelCount);
    void reset();
    void processBlock(echo::FloatAudioBuffer& buffer, int startSample, int numSamples);

    void setIntervalMs(int ms);
    void setVisualSpectrumEnabled(bool enabled);
    void setCallback(Callback callback);
    int getIntervalMs() const;
    bool isVisualSpectrumEnabled() const;
    bool isEnabled() const;

private:
    static constexpr size_t spectrumWindowSampleCount = 2048;

    static float sanitizeDb(float db);
    static float sanitize(float value);
    void resetVisualSpectrumState();
    void computeVisualSpectrum();

    std::atomic<int> intervalMs { 0 };
    std::atomic<bool> visualSpectrumEnabled { false };
    Callback callback;
    std::vector<float> peakSquares;
    std::vector<float> rmsSquares;
    LevelMeterSnapshot callbackSnapshot;
    std::array<float, spectrumWindowSampleCount> spectrumSamples {};
    std::array<float, spectrumWindowSampleCount> spectrumWindow {};
    std::array<float, levelMeterVisualSpectrumBucketCount> spectrumCoefficients {};
    std::array<float, levelMeterVisualSpectrumBucketCount> smoothedSpectrum {};
    size_t spectrumWriteIndex = 0;
    size_t spectrumSampleCount = 0;
    int spectrumDecimationFactor = 1;
    int spectrumDecimationCountdown = 0;
    double spectrumSampleRate = 44100.0;
    float spectrumWindowNormalization = 1.0f;
    bool spectrumWasEnabled = false;
    double samplesSinceReport = 0.0;
    double sampleRate = 44100.0;
    int channelCount = 0;
};
} // namespace echo
