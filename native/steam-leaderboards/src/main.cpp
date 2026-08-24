#include <napi.h>
#include <windows.h>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

using SteamApiCall = std::uint64_t;
using SteamLeaderboard = std::uint64_t;
using SteamLeaderboardEntries = std::uint64_t;

constexpr int kLeaderboardFindResultCallback = 1104;
constexpr int kLeaderboardScoresDownloadedCallback = 1105;
constexpr int kLeaderboardScoreUploadedCallback = 1106;
constexpr std::size_t kLeaderboardDetailsMax = 64;
constexpr auto kApiCallTimeout = std::chrono::seconds(12);

struct LeaderboardFindResult {
  SteamLeaderboard leaderboard;
  std::uint8_t found;
};

struct LeaderboardScoresDownloaded {
  SteamLeaderboard leaderboard;
  SteamLeaderboardEntries entries;
  std::int32_t entryCount;
};

struct LeaderboardScoreUploaded {
  std::uint8_t success;
  SteamLeaderboard leaderboard;
  std::int32_t score;
  std::uint8_t scoreChanged;
  std::int32_t globalRankNew;
  std::int32_t globalRankPrevious;
};

struct LeaderboardEntry {
  std::uint64_t steamId;
  std::int32_t globalRank;
  std::int32_t score;
  std::int32_t detailsCount;
  std::uint64_t ugcHandle;
};

static_assert(sizeof(LeaderboardFindResult) == 16);
static_assert(sizeof(LeaderboardScoresDownloaded) == 24);
static_assert(sizeof(LeaderboardScoreUploaded) == 32);
static_assert(sizeof(LeaderboardEntry) == 32);

using SteamUserStatsAccessor = void* (*)();
using SteamUtilsAccessor = void* (*)();
using SteamFriendsAccessor = void* (*)();
using FindLeaderboardFn = SteamApiCall (*)(void*, const char*);
using UploadLeaderboardScoreFn = SteamApiCall (*)(
    void*, SteamLeaderboard, int, std::int32_t, const std::int32_t*, int);
using DownloadLeaderboardEntriesFn = SteamApiCall (*)(
    void*, SteamLeaderboard, int, int, int);
using GetDownloadedLeaderboardEntryFn = bool (*)(
    void*, SteamLeaderboardEntries, int, LeaderboardEntry*, std::int32_t*, int);
using IsApiCallCompletedFn = bool (*)(void*, SteamApiCall, bool*);
using GetApiCallResultFn = bool (*)(void*, SteamApiCall, void*, int, int, bool*);
using RequestUserInformationFn = bool (*)(void*, std::uint64_t, bool);
using GetFriendPersonaNameFn = const char* (*)(void*, std::uint64_t);

template <typename Function>
Function LoadFunction(HMODULE module, const char* name) {
  return reinterpret_cast<Function>(GetProcAddress(module, name));
}

class SteamLeaderboardApi {
 public:
  bool Initialize(const std::wstring& dllPath, std::string& error) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (module_ != nullptr) return true;

    module_ = GetModuleHandleW(L"steam_api64.dll");
    ownsModule_ = false;
    if (module_ == nullptr && !dllPath.empty()) {
      module_ = LoadLibraryW(dllPath.c_str());
      ownsModule_ = module_ != nullptr;
    }
    if (module_ == nullptr) {
      error = "steam_api64.dll is not loaded";
      return false;
    }

    steamUserStats_ = LoadFunction<SteamUserStatsAccessor>(module_, "SteamAPI_SteamUserStats_v012");
    steamUtils_ = LoadFunction<SteamUtilsAccessor>(module_, "SteamAPI_SteamUtils_v010");
    steamFriends_ = LoadFunction<SteamFriendsAccessor>(module_, "SteamAPI_SteamFriends_v017");
    findLeaderboard_ = LoadFunction<FindLeaderboardFn>(module_, "SteamAPI_ISteamUserStats_FindLeaderboard");
    uploadLeaderboardScore_ = LoadFunction<UploadLeaderboardScoreFn>(module_, "SteamAPI_ISteamUserStats_UploadLeaderboardScore");
    downloadLeaderboardEntries_ = LoadFunction<DownloadLeaderboardEntriesFn>(module_, "SteamAPI_ISteamUserStats_DownloadLeaderboardEntries");
    getDownloadedLeaderboardEntry_ = LoadFunction<GetDownloadedLeaderboardEntryFn>(module_, "SteamAPI_ISteamUserStats_GetDownloadedLeaderboardEntry");
    isApiCallCompleted_ = LoadFunction<IsApiCallCompletedFn>(module_, "SteamAPI_ISteamUtils_IsAPICallCompleted");
    getApiCallResult_ = LoadFunction<GetApiCallResultFn>(module_, "SteamAPI_ISteamUtils_GetAPICallResult");
    requestUserInformation_ = LoadFunction<RequestUserInformationFn>(module_, "SteamAPI_ISteamFriends_RequestUserInformation");
    getFriendPersonaName_ = LoadFunction<GetFriendPersonaNameFn>(module_, "SteamAPI_ISteamFriends_GetFriendPersonaName");

    if (steamUserStats_ == nullptr || steamUtils_ == nullptr || steamFriends_ == nullptr ||
        findLeaderboard_ == nullptr || uploadLeaderboardScore_ == nullptr ||
        downloadLeaderboardEntries_ == nullptr || getDownloadedLeaderboardEntry_ == nullptr ||
        isApiCallCompleted_ == nullptr || getApiCallResult_ == nullptr) {
      error = "steam_api64.dll does not expose the required leaderboard ABI";
      Reset();
      return false;
    }
    return true;
  }

  bool Ready(std::string& error) {
    if (module_ == nullptr) {
      error = "Steam leaderboard bridge is not initialized";
      return false;
    }
    userStats_ = steamUserStats_();
    utils_ = steamUtils_();
    friends_ = steamFriends_();
    if (userStats_ == nullptr || utils_ == nullptr) {
      error = "Steamworks must be initialized before leaderboard access";
      return false;
    }
    return true;
  }

  std::mutex& OperationMutex() { return operationMutex_; }

  SteamApiCall FindLeaderboard(const std::string& name) const {
    return findLeaderboard_(userStats_, name.c_str());
  }

  SteamApiCall UploadScore(
      SteamLeaderboard leaderboard,
      std::int32_t score,
      const std::vector<std::int32_t>& details) const {
    constexpr int keepBest = 1;
    return uploadLeaderboardScore_(
        userStats_,
        leaderboard,
        keepBest,
        score,
        details.empty() ? nullptr : details.data(),
        static_cast<int>(details.size()));
  }

  SteamApiCall DownloadEntries(SteamLeaderboard leaderboard, int request, int start, int end) const {
    return downloadLeaderboardEntries_(userStats_, leaderboard, request, start, end);
  }

  bool GetEntry(
      SteamLeaderboardEntries entries,
      int index,
      LeaderboardEntry& entry,
      std::vector<std::int32_t>& details) const {
    details.assign(kLeaderboardDetailsMax, 0);
    if (!getDownloadedLeaderboardEntry_(
            userStats_, entries, index, &entry, details.data(), static_cast<int>(details.size()))) {
      details.clear();
      return false;
    }
    const auto detailCount = std::clamp(entry.detailsCount, 0, static_cast<int>(kLeaderboardDetailsMax));
    details.resize(static_cast<std::size_t>(detailCount));
    return true;
  }

  std::string PersonaName(std::uint64_t steamId) const {
    if (friends_ == nullptr || getFriendPersonaName_ == nullptr) return {};
    if (requestUserInformation_ != nullptr) requestUserInformation_(friends_, steamId, true);
    const char* value = getFriendPersonaName_(friends_, steamId);
    if (value == nullptr || value[0] == '\0' || std::string(value) == "[unknown]") return {};
    return value;
  }

  template <typename Result>
  bool WaitForResult(SteamApiCall call, int callback, Result& result, std::string& error) const {
    if (call == 0) {
      error = "Steam rejected the leaderboard request";
      return false;
    }
    const auto deadline = std::chrono::steady_clock::now() + kApiCallTimeout;
    while (std::chrono::steady_clock::now() < deadline) {
      bool ioFailure = false;
      if (isApiCallCompleted_(utils_, call, &ioFailure)) {
        if (ioFailure) {
          error = "Steam leaderboard request failed during transport";
          return false;
        }
        if (!getApiCallResult_(utils_, call, &result, sizeof(Result), callback, &ioFailure) || ioFailure) {
          error = "Steam returned an invalid leaderboard result";
          return false;
        }
        return true;
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(15));
    }
    error = "Steam leaderboard request timed out";
    return false;
  }

 private:
  void Reset() {
    if (ownsModule_ && module_ != nullptr) FreeLibrary(module_);
    module_ = nullptr;
    ownsModule_ = false;
  }

  HMODULE module_ = nullptr;
  bool ownsModule_ = false;
  SteamUserStatsAccessor steamUserStats_ = nullptr;
  SteamUtilsAccessor steamUtils_ = nullptr;
  SteamFriendsAccessor steamFriends_ = nullptr;
  FindLeaderboardFn findLeaderboard_ = nullptr;
  UploadLeaderboardScoreFn uploadLeaderboardScore_ = nullptr;
  DownloadLeaderboardEntriesFn downloadLeaderboardEntries_ = nullptr;
  GetDownloadedLeaderboardEntryFn getDownloadedLeaderboardEntry_ = nullptr;
  IsApiCallCompletedFn isApiCallCompleted_ = nullptr;
  GetApiCallResultFn getApiCallResult_ = nullptr;
  RequestUserInformationFn requestUserInformation_ = nullptr;
  GetFriendPersonaNameFn getFriendPersonaName_ = nullptr;
  void* userStats_ = nullptr;
  void* utils_ = nullptr;
  void* friends_ = nullptr;
  std::mutex mutex_;
  std::mutex operationMutex_;
};

SteamLeaderboardApi api;

class PromiseWorker : public Napi::AsyncWorker {
 public:
  explicit PromiseWorker(Napi::Env env)
      : Napi::AsyncWorker(env), deferred_(Napi::Promise::Deferred::New(env)) {}
  Napi::Promise Promise() const { return deferred_.Promise(); }
  void OnError(const Napi::Error& error) override { deferred_.Reject(error.Value()); }

 protected:
  Napi::Promise::Deferred deferred_;
};

class FindWorker final : public PromiseWorker {
 public:
  FindWorker(Napi::Env env, std::string name) : PromiseWorker(env), name_(std::move(name)) {}

  void Execute() override {
    std::lock_guard<std::mutex> lock(api.OperationMutex());
    std::string error;
    if (!api.Ready(error)) return SetError(error);
    LeaderboardFindResult result{};
    if (!api.WaitForResult(api.FindLeaderboard(name_), kLeaderboardFindResultCallback, result, error)) {
      return SetError(error);
    }
    if (result.found == 0 || result.leaderboard == 0) return SetError("Steam leaderboard was not found");
    leaderboard_ = result.leaderboard;
  }

  void OnOK() override { deferred_.Resolve(Napi::BigInt::New(Env(), leaderboard_)); }

 private:
  std::string name_;
  SteamLeaderboard leaderboard_ = 0;
};

class UploadWorker final : public PromiseWorker {
 public:
  UploadWorker(
      Napi::Env env,
      SteamLeaderboard leaderboard,
      std::int32_t score,
      std::vector<std::int32_t> details)
      : PromiseWorker(env), leaderboard_(leaderboard), score_(score), details_(std::move(details)) {}

  void Execute() override {
    std::lock_guard<std::mutex> lock(api.OperationMutex());
    std::string error;
    if (!api.Ready(error)) return SetError(error);
    if (!api.WaitForResult(
            api.UploadScore(leaderboard_, score_, details_),
            kLeaderboardScoreUploadedCallback,
            result_,
            error)) {
      return SetError(error);
    }
    if (result_.success == 0) return SetError("Steam did not accept the leaderboard score");
  }

  void OnOK() override {
    Napi::Object value = Napi::Object::New(Env());
    value.Set("changed", Napi::Boolean::New(Env(), result_.scoreChanged != 0));
    value.Set("score", Napi::Number::New(Env(), result_.score));
    value.Set("globalRank", Napi::Number::New(Env(), result_.globalRankNew));
    value.Set("previousGlobalRank", Napi::Number::New(Env(), result_.globalRankPrevious));
    deferred_.Resolve(value);
  }

 private:
  SteamLeaderboard leaderboard_;
  std::int32_t score_;
  std::vector<std::int32_t> details_;
  LeaderboardScoreUploaded result_{};
};

struct DownloadedEntry {
  std::uint64_t steamId;
  std::int32_t rank;
  std::int32_t score;
  std::string playerName;
  std::vector<std::int32_t> details;
};

class DownloadWorker final : public PromiseWorker {
 public:
  DownloadWorker(Napi::Env env, SteamLeaderboard leaderboard, int request, int start, int end)
      : PromiseWorker(env), leaderboard_(leaderboard), request_(request), start_(start), end_(end) {}

  void Execute() override {
    std::lock_guard<std::mutex> lock(api.OperationMutex());
    std::string error;
    if (!api.Ready(error)) return SetError(error);
    LeaderboardScoresDownloaded result{};
    if (!api.WaitForResult(
            api.DownloadEntries(leaderboard_, request_, start_, end_),
            kLeaderboardScoresDownloadedCallback,
            result,
            error)) {
      return SetError(error);
    }
    entries_.reserve(result.entryCount > 0 ? static_cast<std::size_t>(result.entryCount) : 0);
    for (int index = 0; index < result.entryCount; ++index) {
      LeaderboardEntry entry{};
      std::vector<std::int32_t> details;
      if (!api.GetEntry(result.entries, index, entry, details)) continue;
      entries_.push_back({
          entry.steamId,
          entry.globalRank,
          entry.score,
          api.PersonaName(entry.steamId),
          std::move(details),
      });
    }
  }

  void OnOK() override {
    Napi::Array values = Napi::Array::New(Env(), entries_.size());
    for (std::size_t index = 0; index < entries_.size(); ++index) {
      const auto& entry = entries_[index];
      Napi::Object value = Napi::Object::New(Env());
      value.Set("steamId", Napi::String::New(Env(), std::to_string(entry.steamId)));
      value.Set("rank", Napi::Number::New(Env(), entry.rank));
      value.Set("score", Napi::Number::New(Env(), entry.score));
      value.Set("playerName", entry.playerName.empty() ? Env().Null() : Napi::String::New(Env(), entry.playerName));
      Napi::Array details = Napi::Array::New(Env(), entry.details.size());
      for (std::size_t detailIndex = 0; detailIndex < entry.details.size(); ++detailIndex) {
        details.Set(detailIndex, Napi::Number::New(Env(), entry.details[detailIndex]));
      }
      value.Set("details", details);
      values.Set(index, value);
    }
    deferred_.Resolve(values);
  }

 private:
  SteamLeaderboard leaderboard_;
  int request_;
  int start_;
  int end_;
  std::vector<DownloadedEntry> entries_;
};

Napi::Value Initialize(const Napi::CallbackInfo& info) {
  std::wstring dllPath;
  if (info.Length() > 0 && info[0].IsString()) {
    const auto utf16Path = info[0].As<Napi::String>().Utf16Value();
    dllPath.assign(utf16Path.begin(), utf16Path.end());
  }
  std::string error;
  if (!api.Initialize(dllPath, error)) {
    Napi::Error::New(info.Env(), error).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Value FindLeaderboard(const Napi::CallbackInfo& info) {
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(info.Env(), "leaderboard name must be a string").ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
  auto* worker = new FindWorker(info.Env(), info[0].As<Napi::String>().Utf8Value());
  const auto promise = worker->Promise();
  worker->Queue();
  return promise;
}

bool ReadHandle(const Napi::Value& value, SteamLeaderboard& handle) {
  if (!value.IsBigInt()) return false;
  bool lossless = false;
  handle = value.As<Napi::BigInt>().Uint64Value(&lossless);
  return lossless && handle != 0;
}

Napi::Value UploadScore(const Napi::CallbackInfo& info) {
  SteamLeaderboard leaderboard = 0;
  if (info.Length() < 2 || !ReadHandle(info[0], leaderboard) || !info[1].IsNumber()) {
    Napi::TypeError::New(info.Env(), "uploadScore requires a leaderboard handle and score").ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
  const auto score = info[1].As<Napi::Number>().Int32Value();
  std::vector<std::int32_t> details;
  if (info.Length() > 2 && !info[2].IsUndefined()) {
    if (!info[2].IsArray()) {
      Napi::TypeError::New(info.Env(), "leaderboard score details must be an array").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }
    const auto values = info[2].As<Napi::Array>();
    if (values.Length() > kLeaderboardDetailsMax) {
      Napi::RangeError::New(info.Env(), "leaderboard score details exceed the Steam limit").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }
    details.reserve(values.Length());
    for (std::uint32_t index = 0; index < values.Length(); ++index) {
      const auto value = values.Get(index);
      if (!value.IsNumber()) {
        Napi::TypeError::New(info.Env(), "leaderboard score details must contain only numbers").ThrowAsJavaScriptException();
        return info.Env().Undefined();
      }
      details.push_back(value.As<Napi::Number>().Int32Value());
    }
  }
  auto* worker = new UploadWorker(info.Env(), leaderboard, score, std::move(details));
  const auto promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value DownloadEntries(const Napi::CallbackInfo& info) {
  SteamLeaderboard leaderboard = 0;
  if (info.Length() < 4 || !ReadHandle(info[0], leaderboard) ||
      !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber()) {
    Napi::TypeError::New(info.Env(), "downloadEntries requires handle, request, start, and end").ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
  const int request = info[1].As<Napi::Number>().Int32Value();
  const int start = info[2].As<Napi::Number>().Int32Value();
  const int end = info[3].As<Napi::Number>().Int32Value();
  if (request < 0 || request > 2 || end < start) {
    Napi::RangeError::New(info.Env(), "invalid leaderboard entry range").ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
  auto* worker = new DownloadWorker(info.Env(), leaderboard, request, start, end);
  const auto promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("initialize", Napi::Function::New(env, Initialize));
  exports.Set("findLeaderboard", Napi::Function::New(env, FindLeaderboard));
  exports.Set("uploadScore", Napi::Function::New(env, UploadScore));
  exports.Set("downloadEntries", Napi::Function::New(env, DownloadEntries));
  return exports;
}

}  // namespace

NODE_API_MODULE(echo_steam_leaderboards, Init)
