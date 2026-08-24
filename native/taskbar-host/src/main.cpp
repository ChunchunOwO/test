// echo-taskbar-host.exe
//
// A pure Win32 + Direct2D taskbar mini player.
// Layout: [cover] [title/artist] [prev play next] [lyrics...]
//
// IPC: JSON over stdio.
//   Input: {"type":"state","title":"...","artist":"...","playing":true,"position":12.5,"duration":180.0,"coverPath":"C:\\...","lyrics":"..."}
//          {"type":"show"} / {"type":"hide"} / {"type":"quit"}
//   Output: {"type":"click","action":"playPause"|"next"|"prev"} / {"type":"seek","position":12.5} / {"type":"doubleClick"} / {"type":"ready"}

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shellapi.h>
#include <shellscalingapi.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <d2d1.h>
#include <dwrite.h>
#include <gdiplus.h>
#include <wincodec.h>
#include <shlobj.h>

#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <cstdio>
#include <cstdlib>
#include <cwchar>
#include <iostream>
#include <cmath>
#include <vector>

#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "dwrite.lib")
#pragma comment(lib, "gdiplus.lib")
#pragma comment(lib, "windowscodecs.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "shcore.lib")
#pragma comment(lib, "oleacc.lib")

// Constants

static const wchar_t* kWindowClass = L"EchoTaskbarHost";
static const wchar_t* kWindowTitle = L"ECHO Taskbar Mini Player";
static const DWORD kNoExperimentalWindowBand = 0xFFFFFFFF;
static std::atomic<bool> g_ultraLightFloating{false};
static std::atomic<int> g_queueItemCount{0};
static bool g_queueExpanded = false;
static float g_dpiScale = 1.0f; // updated at startup from system DPI
static int kPreferredWidth = 360;
static int kPreferredHeight = 48;
static float kProgressHeight = 2.0f;
static float kButtonSize = 22.0f;
static float kCoverSize = 36.0f;
static float kPadding = 6.0f;
static float kTitleFontSize = 11.0f;
static float kArtistFontSize = 10.0f;
static float kLyricsFontSize = 11.0f;

// Base layout constants (at 96 DPI / 100% scale)
static const float kBaseWidth = 360.0f;
static const float kBaseHeight = 48.0f;
static const float kBaseProgressHeight = 2.0f;
static const float kBaseButtonSize = 28.0f;
static const float kBaseCoverSize = 38.0f;
static const float kBasePadding = 7.0f;
static const float kBaseTitleFontSize = 13.0f;
static const float kBaseArtistFontSize = 11.0f;
static const float kBaseLyricsFontSize = 12.0f;
static const float kBaseFloatingWidth = 384.0f;
static const float kBaseFloatingHeight = 64.0f;
static const float kBaseQueueRowHeight = 30.0f;
static const int kMaxVisibleQueueItems = 12;

// Update all DPI-scaled layout constants from g_dpiScale
static void applyDpiScale() {
  kPreferredWidth = static_cast<int>(kBaseWidth * g_dpiScale);
  kPreferredHeight = static_cast<int>(kBaseHeight * g_dpiScale);
  kProgressHeight = kBaseProgressHeight * g_dpiScale;
  kButtonSize = kBaseButtonSize * g_dpiScale;
  kCoverSize = kBaseCoverSize * g_dpiScale;
  kPadding = kBasePadding * g_dpiScale;
  kTitleFontSize = kBaseTitleFontSize * g_dpiScale;
  kArtistFontSize = kBaseArtistFontSize * g_dpiScale;
  kLyricsFontSize = kBaseLyricsFontSize * g_dpiScale;
}

static void logHostMsg(const char* msg) {
  wchar_t tempPath[MAX_PATH] = {};
  GetTempPathW(MAX_PATH, tempPath);
  wcscat_s(tempPath, L"echo-taskbar-host.log");

  FILE* f = nullptr;
  _wfopen_s(&f, tempPath, L"a, ccs=UTF-8");
  if (f) {
    SYSTEMTIME st = {};
    GetLocalTime(&st);
    fwprintf(f, L"[%02u:%02u:%02u.%03u] %S\n", st.wHour, st.wMinute, st.wSecond, st.wMilliseconds, msg);
    fclose(f);
  }
}

static DWORD resolveExperimentalWindowBand() {
  size_t requiredLength = 0;
  _wgetenv_s(&requiredLength, nullptr, 0, L"ECHO_TASKBAR_WINDOW_BAND");
  if (requiredLength <= 1) {
    return kNoExperimentalWindowBand;
  }

  std::vector<wchar_t> env(requiredLength);
  _wgetenv_s(&requiredLength, env.data(), env.size(), L"ECHO_TASKBAR_WINDOW_BAND");
  const wchar_t* valueText = env.data();
  if (!valueText[0] || _wcsicmp(valueText, L"0") == 0 || _wcsicmp(valueText, L"off") == 0) {
    return kNoExperimentalWindowBand;
  }

  if (_wcsicmp(valueText, L"uiaccess") == 0) return 2;
  if (_wcsicmp(valueText, L"immersive-mogo") == 0 || _wcsicmp(valueText, L"mogo") == 0) return 6;
  if (_wcsicmp(valueText, L"immersive-search") == 0 || _wcsicmp(valueText, L"search") == 0) return 13;
  if (_wcsicmp(valueText, L"system-tools") == 0 || _wcsicmp(valueText, L"tools") == 0) return 16;
  if (_wcsicmp(valueText, L"above-lock") == 0) return 18;

  wchar_t* end = nullptr;
  unsigned long parsedValue = wcstoul(valueText, &end, 10);
  if (end && *end == L'\0' && parsedValue <= 0xFFFFFFFEUL) {
    return static_cast<DWORD>(parsedValue);
  }

  logHostMsg("Ignoring invalid ECHO_TASKBAR_WINDOW_BAND value");
  fprintf(stderr, "[taskbar-host] Ignoring invalid ECHO_TASKBAR_WINDOW_BAND value\n");
  return kNoExperimentalWindowBand;
}

static bool resolveUltraLightFloatingMode() {
  size_t requiredLength = 0;
  _wgetenv_s(&requiredLength, nullptr, 0, L"ECHO_TASKBAR_WINDOW_MODE");
  if (requiredLength <= 1) return false;
  std::vector<wchar_t> env(requiredLength);
  _wgetenv_s(&requiredLength, env.data(), env.size(), L"ECHO_TASKBAR_WINDOW_MODE");
  return _wcsicmp(env.data(), L"ultra-light-floating") == 0;
}

struct HostWindowBounds {
  int x = 0;
  int y = 0;
  int width = 0;
  int height = 0;
};

static int scaledMargin() {
  return static_cast<int>(8 * g_dpiScale);
}

static bool isWindowsTaskbarLeftAligned() {
  DWORD taskbarAlignment = 1;
  DWORD dataSize = sizeof(taskbarAlignment);
  LSTATUS status = RegGetValueW(
    HKEY_CURRENT_USER,
    L"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
    L"TaskbarAl",
    RRF_RT_REG_DWORD,
    nullptr,
    &taskbarAlignment,
    &dataSize);

  return status == ERROR_SUCCESS && taskbarAlignment == 0;
}

static bool rectIntersectsMonitor(const RECT& rect, const RECT& monitor) {
  return rect.right > monitor.left && rect.left < monitor.right &&
    rect.bottom > monitor.top && rect.top < monitor.bottom;
}

static bool getPrimaryTrayNotifyRect(RECT& rect) {
  HWND taskbar = FindWindowW(L"Shell_TrayWnd", nullptr);
  if (!taskbar) return false;

  HWND tray = FindWindowExW(taskbar, nullptr, L"TrayNotifyWnd", nullptr);
  if (!tray) return false;

  RECT trayRect = {};
  if (!GetWindowRect(tray, &trayRect)) return false;
  if (trayRect.right <= trayRect.left || trayRect.bottom <= trayRect.top) return false;

  rect = trayRect;
  return true;
}

static HostWindowBounds calculateHostWindowBounds(HWND hwndForMonitor) {
  HMONITOR hmon = hwndForMonitor
    ? MonitorFromWindow(hwndForMonitor, MONITOR_DEFAULTTOPRIMARY)
    : MonitorFromPoint(POINT{ 0, 0 }, MONITOR_DEFAULTTOPRIMARY);
  MONITORINFO mi = {};
  mi.cbSize = sizeof(mi);
  GetMonitorInfoW(hmon, &mi);

  int taskbarHeight = mi.rcMonitor.bottom - mi.rcWork.bottom;
  bool taskbarOnBottom = taskbarHeight >= 24;
  bool taskbarOnTop = (mi.rcWork.top - mi.rcMonitor.top) >= 24;
  bool taskbarOnLeft = (mi.rcWork.left - mi.rcMonitor.left) >= 24;
  bool taskbarOnRight = (mi.rcMonitor.right - mi.rcWork.right) >= 24;
  const int margin = scaledMargin();

  HostWindowBounds bounds;
  if (g_ultraLightFloating.load()) {
    const int floatingMargin = static_cast<int>(12 * g_dpiScale);
    bounds.width = static_cast<int>(kBaseFloatingWidth * g_dpiScale);
    const int visibleQueueItems = g_queueExpanded ? std::min(kMaxVisibleQueueItems, g_queueItemCount.load()) : 0;
    bounds.height = static_cast<int>((kBaseFloatingHeight + (g_queueExpanded ? 38.0f + kBaseQueueRowHeight * visibleQueueItems + 8.0f : 0.0f)) * g_dpiScale);
    bounds.x = mi.rcWork.right - bounds.width - floatingMargin;
    bounds.y = mi.rcWork.bottom - bounds.height - floatingMargin;
    return bounds;
  }
  if (taskbarOnBottom) {
    if (taskbarHeight < 24) taskbarHeight = 48;
    bounds.x = mi.rcMonitor.left + margin;
    bounds.y = mi.rcWork.bottom;
    bounds.width = kPreferredWidth;
    bounds.height = taskbarHeight;

    RECT trayRect = {};
    if (isWindowsTaskbarLeftAligned() && getPrimaryTrayNotifyRect(trayRect) && rectIntersectsMonitor(trayRect, mi.rcMonitor)) {
      const int minX = mi.rcMonitor.left + margin;
      const int maxX = mi.rcMonitor.right - bounds.width - margin;
      int trayAlignedX = trayRect.left - bounds.width;
      if (trayAlignedX < minX) trayAlignedX = minX;
      if (trayAlignedX > maxX) trayAlignedX = maxX;
      bounds.x = trayAlignedX;
    }
  } else if (taskbarOnTop) {
    int taskbarH = mi.rcWork.top - mi.rcMonitor.top;
    if (taskbarH < 24) taskbarH = 48;
    bounds.x = mi.rcMonitor.left + margin;
    bounds.y = mi.rcMonitor.top;
    bounds.width = kPreferredWidth;
    bounds.height = taskbarH;
  } else if (taskbarOnRight) {
    int taskbarW = mi.rcMonitor.right - mi.rcWork.right;
    if (taskbarW < 24) taskbarW = 72;
    bounds.x = mi.rcWork.right;
    bounds.y = mi.rcMonitor.bottom - kPreferredHeight - margin;
    bounds.width = taskbarW;
    bounds.height = kPreferredHeight;
  } else if (taskbarOnLeft) {
    int taskbarW = mi.rcWork.left - mi.rcMonitor.left;
    if (taskbarW < 24) taskbarW = 72;
    bounds.x = mi.rcMonitor.left;
    bounds.y = mi.rcMonitor.bottom - kPreferredHeight - margin;
    bounds.width = taskbarW;
    bounds.height = kPreferredHeight;
  } else {
    if (taskbarHeight < 24) taskbarHeight = 48;
    bounds.x = mi.rcMonitor.left + margin;
    bounds.y = mi.rcWork.bottom;
    bounds.width = kPreferredWidth;
    bounds.height = taskbarHeight;
  }

  return bounds;
}
static const UINT_PTR kPollTimerId = 2;
static const UINT kPollIntervalMs = 200;
static const UINT kUltraLightPollIntervalMs = 1000;
static const UINT kRenderIntervalMs = 16;
static const UINT kUltraLightRenderIntervalMs = 250;
static const UINT_PTR kColorTimerId = 3;
static const UINT kColorIntervalMs = 5000; // resample taskbar color every 5s

static D2D1_COLOR_F g_backgroundColor = D2D1::ColorF(0x1A1A1A, 1.0f); // dynamic, sampled from taskbar
static D2D1_COLOR_F g_textColor = D2D1::ColorF(0xF0F0F0, 1.0f);
static D2D1_COLOR_F g_subTextColor = D2D1::ColorF(0xA0A0A0, 1.0f);
static D2D1_COLOR_F g_lyricsColor = D2D1::ColorF(0xFFFFFF, 1.0f);
static bool g_isLightMode = false;
static const D2D1_COLOR_F kProgressColor = D2D1::ColorF(0x4A90D9, 1.0f);
static D2D1_COLOR_F g_progressBackColor = D2D1::ColorF(0x404040, 1.0f);
static D2D1_COLOR_F g_buttonHoverColor = D2D1::ColorF(0xFFFFFF, 0.15f);
static D2D1_COLOR_F g_coverPlaceholderColor = D2D1::ColorF(0x333333, 1.0f);
static D2D1_COLOR_F g_floatingBackgroundColor = D2D1::ColorF(0xFAFBFD, 0.995f);
static D2D1_COLOR_F g_floatingBorderColor = D2D1::ColorF(0xD9E1EC, 1.0f);
static D2D1_COLOR_F g_floatingTextColor = D2D1::ColorF(0x182233, 1.0f);
static D2D1_COLOR_F g_floatingSubTextColor = D2D1::ColorF(0x68778B, 1.0f);
static D2D1_COLOR_F g_floatingCoverColor = D2D1::ColorF(0xEAF0F8, 1.0f);
static D2D1_COLOR_F g_floatingProgressBackColor = D2D1::ColorF(0xDCE4EF, 1.0f);
static D2D1_COLOR_F g_floatingHoverColor = D2D1::ColorF(0xE8EFF8, 1.0f);
static bool g_floatingDarkMode = false;

// State

struct PlayerState {
  std::wstring title = L"No Track";
  std::wstring artist = L"";
  std::wstring lyrics = L"";
  std::wstring coverPath = L"";
  bool playing = false;
  double position = 0.0;
  double duration = 0.0;
  std::wstring queueText = L"";
  int queueCurrentIndex = -1;
  std::wstring playbackOrder = L"顺序播放";
  std::wstring playbackOrderMode = L"sequential";
  std::wstring colorScheme = L"light";
  double volume = 1.0;
};

static std::mutex g_stateMutex;
static PlayerState g_state;
static std::atomic<bool> g_running{true};
static std::thread g_animationThread;
static std::atomic<bool> g_visible{true};
static bool g_isFullscreen = false; // true when foreground app is fullscreen
static HWND g_hwnd = nullptr;
static HostWindowBounds g_lastBounds = {};
static bool g_lastBoundsValid = false;
static bool g_userPositionedFloating = false;
static bool g_progressDragActive = false;
static ULONGLONG g_lastProgressSeekAt = 0;
static bool g_volumeDragActive = false;
static ULONGLONG g_lastVolumeSetAt = 0;

// Direct2D resources
static ID2D1Factory* g_d2dFactory = nullptr;
static ID2D1HwndRenderTarget* g_renderTarget = nullptr;
static IDWriteFactory* g_writeFactory = nullptr;
static IDWriteTextFormat* g_titleFormat = nullptr;
static IDWriteTextFormat* k_artistFormat = nullptr;
static IDWriteTextFormat* g_lyricsFormat = nullptr;
static IDWriteTextLayout* g_lyricsLayout = nullptr;
static IDWriteRenderingParams* g_textRenderingParams = nullptr;
static std::wstring g_cachedLyricsLayoutText;
static float g_cachedLyricsTextWidth = 0.0f;
static float g_cachedLyricsDpiScale = 0.0f;
static std::atomic<bool> g_lyricsShouldAnimate{false};

static HRESULT createUiTextFormat(DWRITE_FONT_WEIGHT weight, float fontSize, IDWriteTextFormat** format) {
  if (!g_writeFactory || !format) return E_INVALIDARG;

  *format = nullptr;
  const wchar_t* fontFamilies[] = {
    L"Microsoft YaHei UI",
    L"Segoe UI Variable Text",
    L"Segoe UI",
  };

  HRESULT hr = E_FAIL;
  for (const wchar_t* family : fontFamilies) {
    hr = g_writeFactory->CreateTextFormat(
      family, nullptr, weight, DWRITE_FONT_STYLE_NORMAL,
      DWRITE_FONT_STRETCH_NORMAL, fontSize, L"zh-CN", format);
    if (SUCCEEDED(hr) && *format) return hr;
  }

  return hr;
}

// Recreate text formats with updated font sizes (called on DPI change)
static void recreateTextFormats() {
  if (!g_writeFactory) return;
  if (g_textRenderingParams) { g_textRenderingParams->Release(); g_textRenderingParams = nullptr; }
  if (g_lyricsLayout) { g_lyricsLayout->Release(); g_lyricsLayout = nullptr; }
  g_cachedLyricsLayoutText.clear();
  g_cachedLyricsTextWidth = 0.0f;
  g_cachedLyricsDpiScale = 0.0f;
  g_lyricsShouldAnimate = false;
  if (g_titleFormat) { g_titleFormat->Release(); g_titleFormat = nullptr; }
  if (k_artistFormat) { k_artistFormat->Release(); k_artistFormat = nullptr; }
  if (g_lyricsFormat) { g_lyricsFormat->Release(); g_lyricsFormat = nullptr; }

  createUiTextFormat(DWRITE_FONT_WEIGHT_MEDIUM, kTitleFontSize, &g_titleFormat);
  createUiTextFormat(DWRITE_FONT_WEIGHT_NORMAL, kArtistFontSize, &k_artistFormat);
  createUiTextFormat(DWRITE_FONT_WEIGHT_NORMAL, kLyricsFontSize, &g_lyricsFormat);
}

static void applyTextRenderingSettings() {
  if (!g_renderTarget) return;

  if (!g_textRenderingParams && g_writeFactory) {
    g_writeFactory->CreateCustomRenderingParams(
      1.0f, 0.0f, 1.0f,
      DWRITE_PIXEL_GEOMETRY_FLAT,
      DWRITE_RENDERING_MODE_NATURAL_SYMMETRIC,
      &g_textRenderingParams);
  }

  g_renderTarget->SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);
  if (g_textRenderingParams) g_renderTarget->SetTextRenderingParams(g_textRenderingParams);
}

static ID2D1SolidColorBrush* g_textBrush = nullptr;
static ID2D1SolidColorBrush* g_subTextBrush = nullptr;
static ID2D1SolidColorBrush* g_lyricsBrush = nullptr;
static ID2D1SolidColorBrush* g_progressBrush = nullptr;
static ID2D1SolidColorBrush* g_progressBackBrush = nullptr;
static ID2D1SolidColorBrush* g_buttonHoverBrush = nullptr;
static ID2D1SolidColorBrush* g_coverPlaceholderBrush = nullptr;
static ID2D1SolidColorBrush* g_floatingBackgroundBrush = nullptr;
static ID2D1SolidColorBrush* g_floatingBorderBrush = nullptr;
static ID2D1SolidColorBrush* g_floatingTextBrush = nullptr;
static ID2D1SolidColorBrush* g_floatingSubTextBrush = nullptr;
static ID2D1SolidColorBrush* g_floatingCoverBrush = nullptr;
static ID2D1SolidColorBrush* g_floatingProgressBackBrush = nullptr;
static ID2D1SolidColorBrush* g_floatingHoverBrush = nullptr;
static ID2D1SolidColorBrush* g_floatingPrimaryIconBrush = nullptr;

static void applyFloatingTheme(bool dark) {
  g_floatingDarkMode = dark;
  g_floatingBackgroundColor = dark ? D2D1::ColorF(0x141820, 0.99f) : D2D1::ColorF(0xFAFBFD, 0.995f);
  g_floatingBorderColor = dark ? D2D1::ColorF(0xFFFFFF, 0.14f) : D2D1::ColorF(0xD9E1EC, 1.0f);
  g_floatingTextColor = dark ? D2D1::ColorF(0xF4F7FB, 1.0f) : D2D1::ColorF(0x182233, 1.0f);
  g_floatingSubTextColor = dark ? D2D1::ColorF(0x9DA9BB, 1.0f) : D2D1::ColorF(0x68778B, 1.0f);
  g_floatingCoverColor = dark ? D2D1::ColorF(0x1C2A42, 1.0f) : D2D1::ColorF(0xEAF0F8, 1.0f);
  g_floatingProgressBackColor = dark ? D2D1::ColorF(0xFFFFFF, 0.13f) : D2D1::ColorF(0xDCE4EF, 1.0f);
  g_floatingHoverColor = dark ? D2D1::ColorF(0xFFFFFF, 0.12f) : D2D1::ColorF(0xE8EFF8, 1.0f);

  if (g_floatingBackgroundBrush) g_floatingBackgroundBrush->SetColor(g_floatingBackgroundColor);
  if (g_floatingBorderBrush) g_floatingBorderBrush->SetColor(g_floatingBorderColor);
  if (g_floatingTextBrush) g_floatingTextBrush->SetColor(g_floatingTextColor);
  if (g_floatingSubTextBrush) g_floatingSubTextBrush->SetColor(g_floatingSubTextColor);
  if (g_floatingCoverBrush) g_floatingCoverBrush->SetColor(g_floatingCoverColor);
  if (g_floatingProgressBackBrush) g_floatingProgressBackBrush->SetColor(g_floatingProgressBackColor);
  if (g_floatingHoverBrush) g_floatingHoverBrush->SetColor(g_floatingHoverColor);
}

// Cover bitmap
static ID2D1Bitmap* g_coverBitmap = nullptr;
static std::wstring g_loadedCoverPath;
static ULONG_PTR g_gdiplusToken = 0;

// Scrolling state
static double g_scrollTime = 0.0; // accumulated time in seconds for scroll animation
static std::wstring g_lastLyricsText; // track lyrics text changes to reset scroll
static ULONGLONG g_lastRenderTick = 0;

static float dpiScale() {
  return g_dpiScale > 0.0f ? g_dpiScale : 1.0f;
}

static float snapPixel(float value) {
  float scale = dpiScale();
  return floorf(value * scale + 0.5f) / scale;
}

static float snapSubpixel(float value) {
  float scale = dpiScale() * 3.0f;
  return floorf(value * scale + 0.5f) / scale;
}

static int g_hoveredButton = -1;

// IPC helpers

static void sendJson(const std::string& json) {
  std::string line = json + "\n";
  HANDLE hStdout = GetStdHandle(STD_OUTPUT_HANDLE);
  WriteFile(hStdout, line.c_str(), static_cast<DWORD>(line.size()), nullptr, nullptr);
  FlushFileBuffers(hStdout);
}

static std::wstring utf8ToWide(const std::string& s) {
  if (s.empty()) return {};
  int len = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0);
  if (len <= 0) return {};
  std::wstring wide(len - 1, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, wide.data(), len);
  return wide;
}

static std::string extractJsonString(const std::string& json, const std::string& key) {
  std::string needle = "\"" + key + "\":\"";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return "";
  pos += needle.size();
  std::string result;
  while (pos < json.size() && json[pos] != '"') {
    if (json[pos] == '\\' && pos + 1 < json.size()) {
      pos++;
      switch (json[pos]) {
        case '"': result += '"'; break;
        case '\\': result += '\\'; break;
        case 'n': result += '\n'; break;
        case 'r': result += '\r'; break;
        case 't': result += '\t'; break;
        default: result += json[pos]; break;
      }
    } else {
      result += json[pos];
    }
    pos++;
  }
  return result;
}

static bool extractJsonBool(const std::string& json, const std::string& key) {
  std::string needle = "\"" + key + "\":";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return false;
  pos += needle.size();
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
  return pos < json.size() && json[pos] == 't';
}

static double extractJsonNumber(const std::string& json, const std::string& key) {
  std::string needle = "\"" + key + "\":";
  size_t pos = json.find(needle);
  if (pos == std::string::npos) return 0.0;
  pos += needle.size();
  while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t')) pos++;
  try {
    return std::stod(json.substr(pos));
  } catch (...) {
    return 0.0;
  }
}

// Cover bitmap loading

static void loadCoverBitmap(const std::wstring& path) {
  if (g_loadedCoverPath == path) return;
  g_loadedCoverPath = path;

  if (g_coverBitmap) { g_coverBitmap->Release(); g_coverBitmap = nullptr; }
  if (path.empty() || !g_renderTarget) return;

  // Use GDI+ to load the image (PNG/JPG/etc.)
  Gdiplus::Bitmap* bitmap = Gdiplus::Bitmap::FromFile(path.c_str());
  if (!bitmap || bitmap->GetLastStatus() != Gdiplus::Ok) {
    delete bitmap;
    return;
  }

  HBITMAP hBmp = nullptr;
  Gdiplus::Color bg(0, 0, 0);
  bitmap->GetHBITMAP(bg, &hBmp);
  delete bitmap;

  if (!hBmp) return;

  BITMAP bm;
  GetObject(hBmp, sizeof(bm), &bm);

  D2D1_SIZE_U size = D2D1::SizeU(bm.bmWidth, bm.bmHeight);
  D2D1_BITMAP_PROPERTIES props = D2D1::BitmapProperties(
    D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));

  HRESULT hr = g_renderTarget->CreateBitmap(size, nullptr, 0, &props, &g_coverBitmap);
  if (SUCCEEDED(hr) && g_coverBitmap) {
    HDC hMemDC = CreateCompatibleDC(nullptr);
    HBITMAP hOldBmp = (HBITMAP)SelectObject(hMemDC, hBmp);

    BITMAPINFO bi = {};
    bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    bi.bmiHeader.biWidth = bm.bmWidth;
    bi.bmiHeader.biHeight = -bm.bmHeight;
    bi.bmiHeader.biPlanes = 1;
    bi.bmiHeader.biBitCount = 32;
    bi.bmiHeader.biCompression = BI_RGB;

    int pixelSize = bm.bmWidth * bm.bmHeight * 4;
    BYTE* pixels = new BYTE[pixelSize];
    GetDIBits(hMemDC, hBmp, 0, bm.bmHeight, pixels, &bi, DIB_RGB_COLORS);
    g_coverBitmap->CopyFromMemory(nullptr, pixels, bm.bmWidth * 4);
    delete[] pixels;

    SelectObject(hMemDC, hOldBmp);
    DeleteDC(hMemDC);
  }

  DeleteObject(hBmp);
}

// Taskbar color sampling

static void sampleTaskbarColor() {
  // Detect light/dark mode from registry and use matching fixed color
  // Windows 11 taskbar: dark mode ~#202020, light mode ~#F3F3F3
  DWORD appsUseLightTheme = 1;
  DWORD dataSize = sizeof(appsUseLightTheme);
  HKEY hKey;

  if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
    0, KEY_READ, &hKey) == ERROR_SUCCESS) {
    RegQueryValueExW(hKey, L"AppsUseLightTheme", nullptr, nullptr,
      reinterpret_cast<LPBYTE>(&appsUseLightTheme), &dataSize);
    RegCloseKey(hKey);
  }

  if (appsUseLightTheme == 0) {
    // Dark mode
    g_isLightMode = false;
    g_backgroundColor = D2D1::ColorF(0x202020, 1.0f);
    g_textColor = D2D1::ColorF(0xF0F0F0, 1.0f);
    g_subTextColor = D2D1::ColorF(0xA0A0A0, 1.0f);
    g_lyricsColor = D2D1::ColorF(0xFFFFFF, 1.0f);
    g_progressBackColor = D2D1::ColorF(0x404040, 1.0f);
    g_buttonHoverColor = D2D1::ColorF(0xFFFFFF, 0.15f);
    g_coverPlaceholderColor = D2D1::ColorF(0x333333, 1.0f);
  } else {
    // Light mode
    g_isLightMode = true;
    g_backgroundColor = D2D1::ColorF(0xF3F3F3, 1.0f);
    g_textColor = D2D1::ColorF(0x1A1A1A, 1.0f);
    g_subTextColor = D2D1::ColorF(0x666666, 1.0f);
    g_lyricsColor = D2D1::ColorF(0x1A1A1A, 1.0f);
    g_progressBackColor = D2D1::ColorF(0xC8C8C8, 1.0f);
    g_buttonHoverColor = D2D1::ColorF(0x000000, 0.10f);
    g_coverPlaceholderColor = D2D1::ColorF(0xDDDDDD, 1.0f);
  }

  // Update brush colors if already created
  if (g_textBrush) g_textBrush->SetColor(g_textColor);
  if (g_subTextBrush) g_subTextBrush->SetColor(g_subTextColor);
  if (g_lyricsBrush) g_lyricsBrush->SetColor(g_lyricsColor);
  if (g_progressBackBrush) g_progressBackBrush->SetColor(g_progressBackColor);
  if (g_buttonHoverBrush) g_buttonHoverBrush->SetColor(g_buttonHoverColor);
  if (g_coverPlaceholderBrush) g_coverPlaceholderBrush->SetColor(g_coverPlaceholderColor);
}

// Direct2D

static bool initD2D() {
  HRESULT hr = D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &g_d2dFactory);
  if (FAILED(hr)) return false;

  hr = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory),
                           reinterpret_cast<IUnknown**>(&g_writeFactory));
  if (FAILED(hr)) return false;

  // Initialize GDI+ for cover art loading
  Gdiplus::GdiplusStartupInput gdiplusStartupInput;
  Gdiplus::GdiplusStartup(&g_gdiplusToken, &gdiplusStartupInput, nullptr);

  RECT rc;
  GetClientRect(g_hwnd, &rc);
  D2D1_SIZE_U size = D2D1::SizeU(rc.right - rc.left, rc.bottom - rc.top);

  // The host window and all layout constants are already scaled to physical
  // pixels. Keep the D2D target at 96 DPI so Windows does not resample text.
  UINT pixelWidth = static_cast<UINT>(std::max<LONG>(1, rc.right - rc.left));
  UINT pixelHeight = static_cast<UINT>(std::max<LONG>(1, rc.bottom - rc.top));

  D2D1_RENDER_TARGET_PROPERTIES rtProps = D2D1::RenderTargetProperties(
    D2D1_RENDER_TARGET_TYPE_DEFAULT,
    D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED),
    96.0f, 96.0f);

  hr = g_d2dFactory->CreateHwndRenderTarget(
    rtProps,
    D2D1::HwndRenderTargetProperties(g_hwnd, D2D1::SizeU(pixelWidth, pixelHeight)),
    &g_renderTarget);
  if (FAILED(hr)) return false;

  applyTextRenderingSettings();
  g_renderTarget->SetAntialiasMode(D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);

  g_renderTarget->CreateSolidColorBrush(g_textColor, &g_textBrush);
  g_renderTarget->CreateSolidColorBrush(g_subTextColor, &g_subTextBrush);
  g_renderTarget->CreateSolidColorBrush(g_lyricsColor, &g_lyricsBrush);
  g_renderTarget->CreateSolidColorBrush(kProgressColor, &g_progressBrush);
  g_renderTarget->CreateSolidColorBrush(g_progressBackColor, &g_progressBackBrush);
  g_renderTarget->CreateSolidColorBrush(g_buttonHoverColor, &g_buttonHoverBrush);
  g_renderTarget->CreateSolidColorBrush(g_coverPlaceholderColor, &g_coverPlaceholderBrush);
  g_renderTarget->CreateSolidColorBrush(g_floatingBackgroundColor, &g_floatingBackgroundBrush);
  g_renderTarget->CreateSolidColorBrush(g_floatingBorderColor, &g_floatingBorderBrush);
  g_renderTarget->CreateSolidColorBrush(g_floatingTextColor, &g_floatingTextBrush);
  g_renderTarget->CreateSolidColorBrush(g_floatingSubTextColor, &g_floatingSubTextBrush);
  g_renderTarget->CreateSolidColorBrush(g_floatingCoverColor, &g_floatingCoverBrush);
  g_renderTarget->CreateSolidColorBrush(g_floatingProgressBackColor, &g_floatingProgressBackBrush);
  g_renderTarget->CreateSolidColorBrush(g_floatingHoverColor, &g_floatingHoverBrush);
  g_renderTarget->CreateSolidColorBrush(D2D1::ColorF(0xFFFFFF, 1.0f), &g_floatingPrimaryIconBrush);

  createUiTextFormat(DWRITE_FONT_WEIGHT_MEDIUM, kTitleFontSize, &g_titleFormat);
  createUiTextFormat(DWRITE_FONT_WEIGHT_NORMAL, kArtistFontSize, &k_artistFormat);
  createUiTextFormat(DWRITE_FONT_WEIGHT_NORMAL, kLyricsFontSize, &g_lyricsFormat);

  return true;
}

static void cleanupD2D() {
  if (g_coverBitmap) { g_coverBitmap->Release(); g_coverBitmap = nullptr; }
  if (g_gdiplusToken) { Gdiplus::GdiplusShutdown(g_gdiplusToken); g_gdiplusToken = 0; }
  if (g_titleFormat) { g_titleFormat->Release(); g_titleFormat = nullptr; }
  if (k_artistFormat) { k_artistFormat->Release(); k_artistFormat = nullptr; }
  if (g_lyricsLayout) { g_lyricsLayout->Release(); g_lyricsLayout = nullptr; }
  g_cachedLyricsLayoutText.clear();
  g_cachedLyricsTextWidth = 0.0f;
  g_cachedLyricsDpiScale = 0.0f;
  g_lyricsShouldAnimate = false;
  if (g_lyricsFormat) { g_lyricsFormat->Release(); g_lyricsFormat = nullptr; }
  if (g_textRenderingParams) { g_textRenderingParams->Release(); g_textRenderingParams = nullptr; }
  if (g_writeFactory) { g_writeFactory->Release(); g_writeFactory = nullptr; }
  if (g_coverPlaceholderBrush) { g_coverPlaceholderBrush->Release(); g_coverPlaceholderBrush = nullptr; }
  if (g_floatingPrimaryIconBrush) { g_floatingPrimaryIconBrush->Release(); g_floatingPrimaryIconBrush = nullptr; }
  if (g_floatingHoverBrush) { g_floatingHoverBrush->Release(); g_floatingHoverBrush = nullptr; }
  if (g_floatingProgressBackBrush) { g_floatingProgressBackBrush->Release(); g_floatingProgressBackBrush = nullptr; }
  if (g_floatingCoverBrush) { g_floatingCoverBrush->Release(); g_floatingCoverBrush = nullptr; }
  if (g_floatingSubTextBrush) { g_floatingSubTextBrush->Release(); g_floatingSubTextBrush = nullptr; }
  if (g_floatingTextBrush) { g_floatingTextBrush->Release(); g_floatingTextBrush = nullptr; }
  if (g_floatingBorderBrush) { g_floatingBorderBrush->Release(); g_floatingBorderBrush = nullptr; }
  if (g_floatingBackgroundBrush) { g_floatingBackgroundBrush->Release(); g_floatingBackgroundBrush = nullptr; }
  if (g_buttonHoverBrush) { g_buttonHoverBrush->Release(); g_buttonHoverBrush = nullptr; }
  if (g_progressBackBrush) { g_progressBackBrush->Release(); g_progressBackBrush = nullptr; }
  if (g_progressBrush) { g_progressBrush->Release(); g_progressBrush = nullptr; }
  if (g_lyricsBrush) { g_lyricsBrush->Release(); g_lyricsBrush = nullptr; }
  if (g_subTextBrush) { g_subTextBrush->Release(); g_subTextBrush = nullptr; }
  if (g_textBrush) { g_textBrush->Release(); g_textBrush = nullptr; }
  if (g_renderTarget) { g_renderTarget->Release(); g_renderTarget = nullptr; }
  if (g_d2dFactory) { g_d2dFactory->Release(); g_d2dFactory = nullptr; }
}

static void resizeRenderTarget() {
  if (!g_renderTarget || !g_hwnd) return;
  RECT rc;
  GetClientRect(g_hwnd, &rc);

  UINT pixelWidth = static_cast<UINT>(std::max<LONG>(1, rc.right - rc.left));
  UINT pixelHeight = static_cast<UINT>(std::max<LONG>(1, rc.bottom - rc.top));
  g_renderTarget->Resize(D2D1::SizeU(pixelWidth, pixelHeight));
  g_renderTarget->SetDpi(96.0f, 96.0f);
  applyTextRenderingSettings();
}

// Drawing

static void drawTriangle(ID2D1HwndRenderTarget* rt, const D2D1_POINT_2F pts[3], ID2D1SolidColorBrush* brush) {
  ID2D1PathGeometry* geo = nullptr;
  g_d2dFactory->CreatePathGeometry(&geo);
  if (!geo) return;
  ID2D1GeometrySink* sink = nullptr;
  geo->Open(&sink);
  if (!sink) { geo->Release(); return; }
  sink->BeginFigure(pts[0], D2D1_FIGURE_BEGIN_FILLED);
  sink->AddLine(pts[1]);
  sink->AddLine(pts[2]);
  sink->EndFigure(D2D1_FIGURE_END_CLOSED);
  sink->Close();
  sink->Release();
  rt->FillGeometry(geo, brush);
  geo->Release();
}

static void drawQueueIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush);
static void drawCollapseQueueIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush);
static void drawShuffleIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush);
static void drawVolumeIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush);
static bool getVolumeSliderBounds(float* left, float* right, float* y);

static void drawPlayPauseIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, bool playing, ID2D1SolidColorBrush* brush) {
  float s = 1.25f * g_dpiScale; // icon scale (DPI-aware)
  if (playing) {
    D2D1_RECT_F r1 = D2D1::RectF(cx - 4*s, cy - 6*s, cx - 1*s, cy + 6*s);
    D2D1_RECT_F r2 = D2D1::RectF(cx + 1*s, cy - 6*s, cx + 4*s, cy + 6*s);
    rt->FillRectangle(r1, brush);
    rt->FillRectangle(r2, brush);
  } else {
    D2D1_POINT_2F pts[3] = {
      D2D1::Point2F(cx - 3*s, cy - 6*s),
      D2D1::Point2F(cx - 3*s, cy + 6*s),
      D2D1::Point2F(cx + 5*s, cy),
    };
    drawTriangle(rt, pts, brush);
  }
}

static void drawPrevIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush) {
  float s = 1.45f * g_dpiScale;
  D2D1_RECT_F bar = D2D1::RectF(cx - 5*s, cy - 5*s, cx - 3*s, cy + 5*s);
  rt->FillRectangle(bar, brush);
  D2D1_POINT_2F pts[3] = {
    D2D1::Point2F(cx + 5*s, cy - 6*s),
    D2D1::Point2F(cx + 5*s, cy + 6*s),
    D2D1::Point2F(cx - 2*s, cy),
  };
  drawTriangle(rt, pts, brush);
}

static void drawNextIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush) {
  float s = 1.45f * g_dpiScale;
  D2D1_RECT_F bar = D2D1::RectF(cx + 3*s, cy - 5*s, cx + 5*s, cy + 5*s);
  rt->FillRectangle(bar, brush);
  D2D1_POINT_2F pts[3] = {
    D2D1::Point2F(cx - 5*s, cy - 6*s),
    D2D1::Point2F(cx - 5*s, cy + 6*s),
    D2D1::Point2F(cx + 2*s, cy),
  };
  drawTriangle(rt, pts, brush);
}

// Truncate text with ellipsis to fit within maxWidth
static std::wstring truncateTextWithEllipsis(const std::wstring& text, IDWriteTextFormat* format,
  float maxWidth) {
  if (text.empty()) return text;

  // Measure full text width
  IDWriteTextLayout* layout = nullptr;
  g_writeFactory->CreateTextLayout(text.c_str(), static_cast<UINT32>(text.size()),
    format, 9999, 9999, &layout);
  if (!layout) return text;

  DWRITE_TEXT_METRICS metrics;
  layout->GetMetrics(&metrics);
  float fullWidth = metrics.widthIncludingTrailingWhitespace;
  layout->Release();

  if (fullWidth <= maxWidth) return text;

      // Binary search for the max number of chars that fits without cutting mid-word
  std::wstring ellipsis = L"\u2026";
  int lo = 1, hi = static_cast<int>(text.size());
  int best = 1;

  while (lo <= hi) {
    int mid = (lo + hi) / 2;
    std::wstring candidate = text.substr(0, mid) + ellipsis;
    g_writeFactory->CreateTextLayout(candidate.c_str(), static_cast<UINT32>(candidate.size()),
      format, 9999, 9999, &layout);
    if (layout) {
      layout->GetMetrics(&metrics);
      float w = metrics.widthIncludingTrailingWhitespace;
      layout->Release();
      if (w <= maxWidth) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    } else {
      hi = mid - 1;
    }
  }

  return text.substr(0, best) + ellipsis;
}

static void render() {
  if (!g_renderTarget) return;

  std::lock_guard<std::mutex> lock(g_stateMutex);
  PlayerState state = g_state;

  // Reload cover if path changed
  loadCoverBitmap(state.coverPath);

  g_renderTarget->BeginDraw();

  g_renderTarget->Clear(D2D1::ColorF(0.0f, 0.0f, 0.0f, 0.0f));

  RECT rc;
  GetClientRect(g_hwnd, &rc);
  float width = static_cast<float>(rc.right - rc.left);
  float height = static_cast<float>(rc.bottom - rc.top);

  const bool floating = g_ultraLightFloating.load();
  const bool wantsDarkFloatingTheme = state.colorScheme == L"dark";
  if (floating && wantsDarkFloatingTheme != g_floatingDarkMode) {
    applyFloatingTheme(wantsDarkFloatingTheme);
  }
  // The expanded queue is an attached panel. Keep the player controls in the
  // fixed header instead of centering them across the enlarged window.
  const float headerHeight = floating ? kBaseFloatingHeight * g_dpiScale : height;
  ID2D1SolidColorBrush* textBrush = floating ? g_floatingTextBrush : g_textBrush;
  ID2D1SolidColorBrush* subTextBrush = floating ? g_floatingSubTextBrush : g_subTextBrush;
  ID2D1SolidColorBrush* progressBackBrush = floating ? g_floatingProgressBackBrush : g_progressBackBrush;
  if (floating && g_floatingBackgroundBrush && g_floatingBorderBrush) {
    const float inset = snapPixel(0.75f * g_dpiScale);
    const float radius = 7.0f * g_dpiScale;
    D2D1_ROUNDED_RECT card = D2D1::RoundedRect(
      D2D1::RectF(inset, inset, width - inset, height - inset), radius, radius);
    g_renderTarget->FillRoundedRectangle(card, g_floatingBackgroundBrush);
    g_renderTarget->DrawRoundedRectangle(card, g_floatingBorderBrush, 1.0f * g_dpiScale);
  }

  // Layout: [cover] [title/artist] [lyrics center] [buttons right]
  float x = floating ? kPadding : 0.0f;

  // Cover (left)
  float coverY = snapPixel((headerHeight - kCoverSize) / 2.0f);
  float coverBottom = coverY + kCoverSize;
  D2D1_RECT_F coverRect = D2D1::RectF(x, coverY, x + kCoverSize, coverY + kCoverSize);
  if (g_coverBitmap) {
    g_renderTarget->DrawBitmap(g_coverBitmap, coverRect, 1.0f,
      D2D1_BITMAP_INTERPOLATION_MODE_LINEAR);
  } else {
    const float coverRadius = floating ? 6.0f * g_dpiScale : 0.0f;
    if (floating) {
      g_renderTarget->FillRoundedRectangle(
        D2D1::RoundedRect(coverRect, coverRadius, coverRadius), g_floatingCoverBrush);
      const float glowRadius = kCoverSize * 0.19f;
      g_renderTarget->FillEllipse(D2D1::Ellipse(
        D2D1::Point2F(coverRect.left + kCoverSize * 0.24f, coverRect.top + kCoverSize * 0.24f),
        glowRadius, glowRadius), g_buttonHoverBrush);
      const float noteX = coverRect.left + kCoverSize * 0.55f;
      const float noteTop = coverRect.top + kCoverSize * 0.27f;
      const float noteBottom = coverRect.top + kCoverSize * 0.64f;
      g_renderTarget->DrawLine(D2D1::Point2F(noteX, noteTop), D2D1::Point2F(noteX, noteBottom),
        g_progressBrush, 1.8f * g_dpiScale);
      g_renderTarget->DrawLine(D2D1::Point2F(noteX, noteTop), D2D1::Point2F(noteX + kCoverSize * 0.18f, noteTop + kCoverSize * 0.07f),
        g_progressBrush, 1.8f * g_dpiScale);
      g_renderTarget->FillEllipse(D2D1::Ellipse(
        D2D1::Point2F(noteX - kCoverSize * 0.09f, noteBottom),
        kCoverSize * 0.10f, kCoverSize * 0.075f), g_progressBrush);
    } else {
      g_renderTarget->FillRectangle(coverRect, g_coverPlaceholderBrush);
    }
  }
  float contentGap = snapPixel(kPadding * 0.6f);
  float titleTop = snapPixel(coverY - kPadding * 0.35f);
  x += kCoverSize + contentGap;

  // Buttons (right side)
  float btnAreaW = snapPixel(kButtonSize * 3 + kPadding * 2);
  float btnAreaX = snapPixel(width - btnAreaW - (floating ? kPadding : 0.0f));
  float btnY = snapPixel((headerHeight - kButtonSize) / 2.0f);
  float prevX = btnAreaX;
  float playX = btnAreaX + kButtonSize + kPadding;
  float nextX = btnAreaX + (kButtonSize + kPadding) * 2;
  float orderX = prevX - kButtonSize - kPadding;
  float queueX = orderX - kButtonSize - kPadding;
  float closeX = queueX - kButtonSize - kPadding;

  // The central control remains the only filled action, but uses a restrained
  // rounded-square shape so it does not visually overpower the compact player.
  for (int i = 0; i < 3; i++) {
    if (floating && i == 1) {
      const float inset = 1.5f * g_dpiScale;
      const float radius = 7.0f * g_dpiScale;
      g_renderTarget->FillRoundedRectangle(D2D1::RoundedRect(
        D2D1::RectF(playX + inset, btnY + inset, playX + kButtonSize - inset, btnY + kButtonSize - inset),
        radius, radius), g_progressBrush);
    } else if (i == g_hoveredButton) {
      float bx = (i == 0) ? prevX : (i == 1) ? playX : nextX;
      D2D1_RECT_F r = D2D1::RectF(bx, btnY, bx + kButtonSize, btnY + kButtonSize);
      if (floating) {
        const float radius = 7.0f * g_dpiScale;
        g_renderTarget->FillRoundedRectangle(D2D1::RoundedRect(r, radius, radius), g_floatingHoverBrush);
      } else {
        g_renderTarget->FillRectangle(r, g_buttonHoverBrush);
      }
    }
  }

  drawPrevIcon(g_renderTarget, prevX + kButtonSize / 2, btnY + kButtonSize / 2, subTextBrush);
  drawPlayPauseIcon(g_renderTarget, playX + kButtonSize / 2, btnY + kButtonSize / 2, state.playing,
    floating ? g_floatingPrimaryIconBrush : textBrush);
  drawNextIcon(g_renderTarget, nextX + kButtonSize / 2, btnY + kButtonSize / 2, subTextBrush);
  if (floating) {
    const float auxRadius = 5.0f * g_dpiScale;
    const bool orderActive = state.playbackOrderMode != L"sequential";
    for (float auxX : { closeX, orderX, queueX }) {
      const bool isClose = auxX == closeX && g_hoveredButton == 5;
      if ((auxX == orderX && g_hoveredButton == 3) || (auxX == queueX && g_hoveredButton == 4)) {
        g_renderTarget->FillRoundedRectangle(D2D1::RoundedRect(
          D2D1::RectF(auxX, btnY, auxX + kButtonSize, btnY + kButtonSize), auxRadius, auxRadius), g_floatingHoverBrush);
      } else if (isClose) {
        g_renderTarget->FillRoundedRectangle(D2D1::RoundedRect(
          D2D1::RectF(auxX, btnY, auxX + kButtonSize, btnY + kButtonSize), auxRadius, auxRadius), g_floatingHoverBrush);
      }
    }
    const auto orderBrush = orderActive ? g_progressBrush : subTextBrush;
    drawShuffleIcon(g_renderTarget, orderX + kButtonSize / 2, btnY + kButtonSize / 2, orderBrush);
    const float closeScale = 1.05f * g_dpiScale;
    g_renderTarget->DrawLine(D2D1::Point2F(closeX + kButtonSize / 2 - 4.0f * closeScale, btnY + kButtonSize / 2 - 4.0f * closeScale),
      D2D1::Point2F(closeX + kButtonSize / 2 + 4.0f * closeScale, btnY + kButtonSize / 2 + 4.0f * closeScale), subTextBrush, 1.35f * g_dpiScale);
    g_renderTarget->DrawLine(D2D1::Point2F(closeX + kButtonSize / 2 + 4.0f * closeScale, btnY + kButtonSize / 2 - 4.0f * closeScale),
      D2D1::Point2F(closeX + kButtonSize / 2 - 4.0f * closeScale, btnY + kButtonSize / 2 + 4.0f * closeScale), subTextBrush, 1.35f * g_dpiScale);
    if (g_queueExpanded) {
      drawCollapseQueueIcon(g_renderTarget, queueX + kButtonSize / 2, btnY + kButtonSize / 2, subTextBrush);
    } else {
      drawQueueIcon(g_renderTarget, queueX + kButtonSize / 2, btnY + kButtonSize / 2, subTextBrush);
    }
  }

  // Available space between cover and buttons
  float contentLeft = x;
  float contentRight = (floating ? closeX : btnAreaX) - kPadding;

  if (!state.lyrics.empty() && contentRight > contentLeft + 80) {
    // With lyrics: [title top] [artist + lyrics on same line bottom]
    float contentLeft2 = contentLeft;
    float contentRight2 = contentRight;

    // Title (top, aligned with cover top area, truncated to fit)
    {
      std::wstring title = state.title.empty() ? L"No Track" : state.title;
      float titleMaxW = contentRight2 - contentLeft2;
      title = truncateTextWithEllipsis(title, g_titleFormat, titleMaxW);
      float titleLineH = kTitleFontSize * 1.35f;
      D2D1_RECT_F titleRect = D2D1::RectF(contentLeft2, titleTop, contentRight2, titleTop + titleLineH);
      g_titleFormat->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
      g_titleFormat->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_NEAR);
      g_titleFormat->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
      g_renderTarget->DrawText(title.c_str(), static_cast<UINT32>(title.size()),
        g_titleFormat, titleRect, textBrush,
        D2D1_DRAW_TEXT_OPTIONS_NONE, DWRITE_MEASURING_MODE_GDI_CLASSIC);
    }

    // Artist (bottom-left, same line as lyrics)
    float artistLeft = contentLeft2;
    float artistRight = contentLeft2;
    {
      std::wstring artist = state.artist;
      // Truncate artist to 14 chars for lyrics space
      if (artist.size() > 14) {
        artist = artist.substr(0, 14) + L"\u2026";
      }
      // Measure artist width
      IDWriteTextLayout* artistLayout = nullptr;
      g_writeFactory->CreateTextLayout(artist.c_str(), static_cast<UINT32>(artist.size()),
        k_artistFormat, 9999, 9999, &artistLayout);
      float artistW = 0;
      if (artistLayout) {
        DWRITE_TEXT_METRICS m;
        artistLayout->GetMetrics(&m);
        artistW = m.widthIncludingTrailingWhitespace;
        artistLayout->Release();
      }
      artistRight = snapPixel(artistLeft + artistW + kPadding * 2);

      float artistLineHeight = kArtistFontSize * 1.4f;
      D2D1_RECT_F artistRect = D2D1::RectF(artistLeft, coverBottom - artistLineHeight, artistRight, coverBottom);
      k_artistFormat->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
      k_artistFormat->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_NEAR);
      k_artistFormat->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
      g_renderTarget->DrawText(artist.c_str(), static_cast<UINT32>(artist.size()),
        k_artistFormat, artistRect, subTextBrush,
        D2D1_DRAW_TEXT_OPTIONS_NONE, DWRITE_MEASURING_MODE_GDI_CLASSIC);
    }

    // Lyrics (same line as artist, to the right of artist name)
    {
      float lyricsLeft = snapPixel(artistRight);
      float lyricsRight = snapPixel(contentRight);
      float lyricsH = kLyricsFontSize * 1.4f;
      float lyricsY = snapPixel(coverBottom - lyricsH);

      g_renderTarget->PushAxisAlignedClip(
        D2D1::RectF(lyricsLeft, lyricsY, lyricsRight, lyricsY + lyricsH),
        D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);

      std::wstring lyrics = state.lyrics;

      // Reset scroll animation when lyrics text changes
      if (lyrics != g_lastLyricsText) {
        g_lastLyricsText = lyrics;
        g_scrollTime = 0.0;
      }

      g_lyricsFormat->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
      g_lyricsFormat->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
      g_lyricsFormat->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);

      bool recreateLyricsLayout = !g_lyricsLayout ||
        lyrics != g_cachedLyricsLayoutText ||
        fabsf(g_cachedLyricsDpiScale - g_dpiScale) > 0.001f;
      if (recreateLyricsLayout) {
        if (g_lyricsLayout) { g_lyricsLayout->Release(); g_lyricsLayout = nullptr; }
        g_cachedLyricsLayoutText = lyrics;
        g_cachedLyricsTextWidth = 0.0f;
        g_cachedLyricsDpiScale = g_dpiScale;

        g_writeFactory->CreateTextLayout(lyrics.c_str(), static_cast<UINT32>(lyrics.size()),
          g_lyricsFormat, 9999.0f, lyricsH, &g_lyricsLayout);
        if (g_lyricsLayout) {
          DWRITE_TEXT_METRICS metrics;
          g_lyricsLayout->GetMetrics(&metrics);
          g_cachedLyricsTextWidth = metrics.widthIncludingTrailingWhitespace;
        }
      }

      float availWidth = lyricsRight - lyricsLeft;
      float offsetX = 0.0f;
      bool shouldScroll = g_lyricsLayout && g_cachedLyricsTextWidth > availWidth;
      g_lyricsShouldAnimate = shouldScroll;
      if (shouldScroll) {
        float scrollDistance = g_cachedLyricsTextWidth - availWidth + 16.0f * g_dpiScale;
        float scrollSpeed = 25.0f * g_dpiScale;
        float scrollDuration = scrollDistance / scrollSpeed;
        float pauseDuration = 1.5f;
        float cycle = pauseDuration + scrollDuration + 0.5f;
        float t = static_cast<float>(fmod(g_scrollTime, cycle));
        if (t < pauseDuration) {
          offsetX = 0.0f;
        } else if (t < pauseDuration + scrollDuration) {
          offsetX = -((t - pauseDuration) * scrollSpeed);
        } else {
          offsetX = -scrollDistance;
        }
        offsetX = snapSubpixel(offsetX);
      }

      if (g_lyricsLayout) {
        g_renderTarget->DrawTextLayout(
          D2D1::Point2F(snapSubpixel(lyricsLeft + offsetX), lyricsY),
          g_lyricsLayout,
          textBrush,
          D2D1_DRAW_TEXT_OPTIONS_NONE);
      }

      g_renderTarget->PopAxisAlignedClip();
    }
  } else {
    // No lyrics: title/artist takes full width
    if (contentRight > contentLeft + 40) {
      std::wstring title = state.title.empty() ? L"No Track" : state.title;
      std::wstring artist = state.artist;
      // Truncate artist to 14 chars
      if (artist.size() > 14) {
        artist = artist.substr(0, 14) + L"\u2026";
      }
      // Truncate title to fit available width
      title = truncateTextWithEllipsis(title, g_titleFormat, contentRight - contentLeft);
      float lineH = kArtistFontSize * 1.4f;
      float titleLineH = kTitleFontSize * 1.35f;
      D2D1_RECT_F titleRect = D2D1::RectF(contentLeft, titleTop, contentRight, titleTop + titleLineH);
      g_titleFormat->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
      g_titleFormat->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_NEAR);
      g_titleFormat->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
      g_renderTarget->DrawText(title.c_str(), static_cast<UINT32>(title.size()),
        g_titleFormat, titleRect, textBrush,
        D2D1_DRAW_TEXT_OPTIONS_NONE, DWRITE_MEASURING_MODE_GDI_CLASSIC);
      D2D1_RECT_F artistRect = D2D1::RectF(contentLeft, coverBottom - lineH, contentRight, coverBottom);
      k_artistFormat->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
      k_artistFormat->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_NEAR);
      k_artistFormat->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
      g_renderTarget->DrawText(artist.c_str(), static_cast<UINT32>(artist.size()),
        k_artistFormat, artistRect, subTextBrush,
        D2D1_DRAW_TEXT_OPTIONS_NONE, DWRITE_MEASURING_MODE_GDI_CLASSIC);
    }
  }

  // Progress bar at bottom
  const float progressInset = floating ? kPadding : 0.0f;
  float progressY = headerHeight - kProgressHeight - (floating ? 4.0f * g_dpiScale : 0.0f);
  D2D1_RECT_F progressBack = D2D1::RectF(progressInset, progressY, width - progressInset, progressY + kProgressHeight);
  if (floating) {
    const float radius = kProgressHeight / 2.0f;
    g_renderTarget->FillRoundedRectangle(D2D1::RoundedRect(progressBack, radius, radius), progressBackBrush);
  } else {
    g_renderTarget->FillRectangle(progressBack, progressBackBrush);
  }

  if (state.duration > 0.1 && state.position >= 0) {
    float ratio = static_cast<float>(state.position / state.duration);
    ratio = (ratio < 0) ? 0 : (ratio > 1) ? 1 : ratio;
    D2D1_RECT_F progress = D2D1::RectF(progressInset, progressY,
      progressInset + (width - progressInset * 2.0f) * ratio, progressY + kProgressHeight);
    if (floating) {
      const float radius = kProgressHeight / 2.0f;
      g_renderTarget->FillRoundedRectangle(D2D1::RoundedRect(progress, radius, radius), g_progressBrush);
    } else {
      g_renderTarget->FillRectangle(progress, g_progressBrush);
    }
  }

  if (floating && g_queueExpanded) {
    const float headerY = headerHeight + 6.0f * g_dpiScale;
    const float rowHeight = kBaseQueueRowHeight * g_dpiScale;
    const float rowLeft = kPadding;
    const float rowRight = width - kPadding;
    g_renderTarget->DrawLine(
      D2D1::Point2F(rowLeft, headerHeight), D2D1::Point2F(rowRight, headerHeight),
      g_floatingBorderBrush, 1.0f * g_dpiScale);
    const std::wstring queueTitle = state.queueText.empty() ? L"队列为空" : L"队列  ·  " + state.playbackOrder;
    float volumeLeft = 0, volumeRight = 0, volumeY = 0;
    getVolumeSliderBounds(&volumeLeft, &volumeRight, &volumeY);
    D2D1_RECT_F queueHeader = D2D1::RectF(rowLeft, headerY, volumeLeft - 18.0f * g_dpiScale, headerY + 24.0f * g_dpiScale);
    k_artistFormat->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
    g_renderTarget->DrawText(queueTitle.c_str(), static_cast<UINT32>(queueTitle.size()), k_artistFormat, queueHeader, subTextBrush);
    drawVolumeIcon(g_renderTarget, volumeLeft - 10.0f * g_dpiScale, volumeY, subTextBrush);
    const float volumeRadius = 2.0f * g_dpiScale;
    D2D1_RECT_F volumeTrack = D2D1::RectF(volumeLeft, volumeY - 2.0f * g_dpiScale, volumeRight, volumeY + 2.0f * g_dpiScale);
    g_renderTarget->FillRoundedRectangle(D2D1::RoundedRect(volumeTrack, volumeRadius, volumeRadius), g_floatingProgressBackBrush);
    const float volumeRatio = static_cast<float>(std::max(0.0, std::min(1.0, state.volume)));
    D2D1_RECT_F volumeValue = D2D1::RectF(volumeLeft, volumeTrack.top, volumeLeft + (volumeRight - volumeLeft) * volumeRatio, volumeTrack.bottom);
    g_renderTarget->FillRoundedRectangle(D2D1::RoundedRect(volumeValue, volumeRadius, volumeRadius), g_progressBrush);
    const float volumeThumbX = volumeLeft + (volumeRight - volumeLeft) * volumeRatio;
    g_renderTarget->FillEllipse(D2D1::Ellipse(D2D1::Point2F(volumeThumbX, volumeY), 3.0f * g_dpiScale, 3.0f * g_dpiScale), g_progressBrush);
    std::vector<std::wstring> queueItems;
    size_t start = 0;
    while (start < state.queueText.size() && static_cast<int>(queueItems.size()) < kMaxVisibleQueueItems) {
      size_t end = state.queueText.find(L'\n', start);
      queueItems.push_back(state.queueText.substr(start, end == std::wstring::npos ? std::wstring::npos : end - start));
      if (end == std::wstring::npos) break;
      start = end + 1;
    }
    for (size_t index = 0; index < queueItems.size(); index++) {
      const float rowY = headerY + 27.0f * g_dpiScale + rowHeight * static_cast<float>(index);
      const bool current = static_cast<int>(index) == state.queueCurrentIndex;
      if (current || (g_hoveredButton == 100 + static_cast<int>(index))) {
        g_renderTarget->FillRoundedRectangle(D2D1::RoundedRect(
          D2D1::RectF(rowLeft, rowY, rowRight, rowY + rowHeight - 2.0f * g_dpiScale), 4.0f * g_dpiScale, 4.0f * g_dpiScale),
          current ? g_floatingHoverBrush : g_floatingProgressBackBrush);
      }
      std::wstring item = truncateTextWithEllipsis(queueItems[index], k_artistFormat, rowRight - rowLeft - 12.0f * g_dpiScale);
      D2D1_RECT_F itemRect = D2D1::RectF(rowLeft + 6.0f * g_dpiScale, rowY, rowRight, rowY + rowHeight - 2.0f * g_dpiScale);
      k_artistFormat->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
      g_renderTarget->DrawText(item.c_str(), static_cast<UINT32>(item.size()), k_artistFormat, itemRect,
        current ? textBrush : subTextBrush);
    }
  }

  HRESULT hr = g_renderTarget->EndDraw();
  if (hr == D2DERR_RECREATE_TARGET) {
    cleanupD2D();
    initD2D();
  }
}

// Button hit-testing

static int hitTestButton(int x, int y) {
  if (!g_hwnd) return -1;
  RECT rc;
  GetClientRect(g_hwnd, &rc);
  float width = static_cast<float>(rc.right - rc.left);
  float height = static_cast<float>(rc.bottom - rc.top);
  const float headerHeight = g_ultraLightFloating.load() ? kBaseFloatingHeight * g_dpiScale : height;

  // Buttons are on the right side (no lyrics offset)
  float btnAreaW = snapPixel(kButtonSize * 3 + kPadding * 2);
  float btnAreaX = snapPixel(width - btnAreaW - (g_ultraLightFloating.load() ? kPadding : 0.0f));
  float btnY = snapPixel((headerHeight - kButtonSize) / 2.0f);
  float prevX = btnAreaX;
  float playX = btnAreaX + kButtonSize + kPadding;
  float nextX = btnAreaX + (kButtonSize + kPadding) * 2;
  float orderX = prevX - kButtonSize - kPadding;
  float queueX = orderX - kButtonSize - kPadding;
  float closeX = queueX - kButtonSize - kPadding;

  if (y >= static_cast<int>(btnY) && y <= static_cast<int>(btnY + kButtonSize)) {
    if (x >= static_cast<int>(prevX) && x <= static_cast<int>(prevX + kButtonSize)) return 0;
    if (x >= static_cast<int>(playX) && x <= static_cast<int>(playX + kButtonSize)) return 1;
    if (x >= static_cast<int>(nextX) && x <= static_cast<int>(nextX + kButtonSize)) return 2;
    if (g_ultraLightFloating.load() && x >= static_cast<int>(orderX) && x <= static_cast<int>(orderX + kButtonSize)) return 3;
    if (g_ultraLightFloating.load() && x >= static_cast<int>(queueX) && x <= static_cast<int>(queueX + kButtonSize)) return 4;
    if (g_ultraLightFloating.load() && x >= static_cast<int>(closeX) && x <= static_cast<int>(closeX + kButtonSize)) return 5;
  }
  if (g_ultraLightFloating.load() && g_queueExpanded) {
    const float headerY = headerHeight + 33.0f * g_dpiScale;
    const float rowHeight = kBaseQueueRowHeight * g_dpiScale;
    const int index = static_cast<int>((y - headerY) / rowHeight);
    if (x >= static_cast<int>(kPadding) && x <= static_cast<int>(width - kPadding) &&
      index >= 0 && index < std::min(kMaxVisibleQueueItems, g_queueItemCount.load())) return 100 + index;
  }
  return -1;
}

static void drawQueueIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush) {
  const float s = 1.25f * g_dpiScale;
  rt->DrawLine(D2D1::Point2F(cx - 4.5f * s, cy - 4.0f * s), D2D1::Point2F(cx + 4.5f * s, cy - 4.0f * s), brush, 1.35f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx - 4.5f * s, cy), D2D1::Point2F(cx + 4.5f * s, cy), brush, 1.35f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx - 4.5f * s, cy + 4.0f * s), D2D1::Point2F(cx + 1.5f * s, cy + 4.0f * s), brush, 1.35f * g_dpiScale);
}

static void drawCollapseQueueIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush) {
  const float s = 1.25f * g_dpiScale;
  rt->DrawLine(D2D1::Point2F(cx - 4.5f * s, cy + 2.5f * s), D2D1::Point2F(cx, cy - 2.0f * s), brush, 1.5f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx, cy - 2.0f * s), D2D1::Point2F(cx + 4.5f * s, cy + 2.5f * s), brush, 1.5f * g_dpiScale);
}

static void drawShuffleIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush) {
  const float s = 1.15f * g_dpiScale;
  rt->DrawLine(D2D1::Point2F(cx - 5.0f * s, cy - 4.0f * s), D2D1::Point2F(cx - 2.0f * s, cy - 4.0f * s), brush, 1.35f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx - 2.0f * s, cy - 4.0f * s), D2D1::Point2F(cx + 5.0f * s, cy + 4.0f * s), brush, 1.35f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx - 5.0f * s, cy + 4.0f * s), D2D1::Point2F(cx - 2.0f * s, cy + 4.0f * s), brush, 1.35f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx - 2.0f * s, cy + 4.0f * s), D2D1::Point2F(cx + 5.0f * s, cy - 4.0f * s), brush, 1.35f * g_dpiScale);
  const D2D1_POINT_2F arrow[] = {
    D2D1::Point2F(cx + 5.0f * s, cy - 7.0f * s), D2D1::Point2F(cx + 5.0f * s, cy - 1.0f * s), D2D1::Point2F(cx + 8.0f * s, cy - 4.0f * s),
  };
  drawTriangle(rt, arrow, brush);
}

static void drawVolumeIcon(ID2D1HwndRenderTarget* rt, float cx, float cy, ID2D1SolidColorBrush* brush) {
  const float s = 0.92f * g_dpiScale;
  rt->FillRectangle(D2D1::RectF(cx - 6.0f * s, cy - 2.7f * s, cx - 3.0f * s, cy + 2.7f * s), brush);
  rt->DrawLine(D2D1::Point2F(cx - 3.0f * s, cy - 2.7f * s), D2D1::Point2F(cx + 1.4f * s, cy - 6.0f * s), brush, 1.6f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx + 1.4f * s, cy - 6.0f * s), D2D1::Point2F(cx + 1.4f * s, cy + 6.0f * s), brush, 1.6f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx + 1.4f * s, cy + 6.0f * s), D2D1::Point2F(cx - 3.0f * s, cy + 2.7f * s), brush, 1.6f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx + 3.7f * s, cy - 3.4f * s), D2D1::Point2F(cx + 5.5f * s, cy), brush, 1.15f * g_dpiScale);
  rt->DrawLine(D2D1::Point2F(cx + 5.5f * s, cy), D2D1::Point2F(cx + 3.7f * s, cy + 3.4f * s), brush, 1.15f * g_dpiScale);
}

// Fullscreen app detection

// Check if a specific window is fullscreen (covers entire monitor)
static bool isWindowFullscreen(HWND hwnd) {
  if (!hwnd || hwnd == g_hwnd) return false;

  wchar_t className[64] = {};
  GetClassNameW(hwnd, className, 63);
  if (wcscmp(className, L"Progman") == 0 || wcscmp(className, L"WorkerW") == 0)
    return false;

  if (!IsWindowVisible(hwnd)) return false;

  RECT wRect;
  if (!GetWindowRect(hwnd, &wRect)) return false;

  HMONITOR hMon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
  MONITORINFO mi = {};
  mi.cbSize = sizeof(mi);
  if (!GetMonitorInfoW(hMon, &mi)) return false;

  return (wRect.left <= mi.rcMonitor.left &&
          wRect.right >= mi.rcMonitor.right &&
          wRect.top <= mi.rcMonitor.top &&
          wRect.bottom >= mi.rcMonitor.bottom);
}

// Check if foreground window is fullscreen
static bool isForegroundFullscreen() {
  return isWindowFullscreen(GetForegroundWindow());
}

// Custom message for immediate topmost reassert (triggered by WinEvent hook)
#define WM_APP_REASSERT_TOPMOST (WM_APP + 1)
#define WM_APP_FAST_VISIBILITY   (WM_APP + 2)
#define WM_APP_APPBAR_NOTIFY     (WM_APP + 3)
#define WM_APP_MODE_CHANGED      (WM_APP + 4)
#ifndef WM_MINIMIZEALL
#define WM_MINIMIZEALL 0x0316
#endif

static bool g_appBarRegistered = false;

static void configureAppBarForCurrentMode() {
  if (!g_hwnd) return;
  APPBARDATA abd = {};
  abd.cbSize = sizeof(abd);
  abd.hWnd = g_hwnd;
  abd.uCallbackMessage = WM_APP_APPBAR_NOTIFY;
  if (g_ultraLightFloating.load()) {
    if (g_appBarRegistered) {
      SHAppBarMessage(ABM_REMOVE, &abd);
      g_appBarRegistered = false;
    }
    return;
  }

  if (!g_appBarRegistered) {
    g_appBarRegistered = (SHAppBarMessage(ABM_NEW, &abd) != 0);
  }
}

static bool isProgressHit(int x, int y) {
  if (!g_ultraLightFloating.load() || !g_hwnd) return false;
  RECT rc;
  GetClientRect(g_hwnd, &rc);
  const float width = static_cast<float>(rc.right - rc.left);
  const float inset = kPadding;
  const float progressY = kBaseFloatingHeight * g_dpiScale - kProgressHeight - 4.0f * g_dpiScale;
  const float hitPadding = 7.0f * g_dpiScale;
  return x >= static_cast<int>(inset) && x <= static_cast<int>(width - inset) &&
    y >= static_cast<int>(progressY - hitPadding) && y <= static_cast<int>(progressY + kProgressHeight + hitPadding);
}

static void sendSeekForProgressX(int x) {
  if (!g_hwnd) return;
  PlayerState state;
  {
    std::lock_guard<std::mutex> lock(g_stateMutex);
    state = g_state;
  }
  if (!(state.duration > 0.1) || !std::isfinite(state.duration)) return;

  RECT rc;
  GetClientRect(g_hwnd, &rc);
  const float width = static_cast<float>(rc.right - rc.left);
  const float inset = kPadding;
  const float trackWidth = std::max(1.0f, width - inset * 2.0f);
  float ratio = (static_cast<float>(x) - inset) / trackWidth;
  ratio = (ratio < 0.0f) ? 0.0f : (ratio > 1.0f) ? 1.0f : ratio;
  const double position = state.duration * ratio;
  char message[96] = {};
  snprintf(message, sizeof(message), "{\"type\":\"seek\",\"position\":%.3f}", position);
  sendJson(message);
}

static bool getVolumeSliderBounds(float* left, float* right, float* y) {
  if (!g_ultraLightFloating.load() || !g_queueExpanded || !g_hwnd) return false;
  RECT rc;
  GetClientRect(g_hwnd, &rc);
  const float width = static_cast<float>(rc.right - rc.left);
  const float headerHeight = kBaseFloatingHeight * g_dpiScale;
  if (left) *left = width - kPadding - 76.0f * g_dpiScale;
  if (right) *right = width - kPadding;
  if (y) *y = headerHeight + 17.0f * g_dpiScale;
  return true;
}

static bool isVolumeHit(int x, int y) {
  float left = 0, right = 0, sliderY = 0;
  if (!getVolumeSliderBounds(&left, &right, &sliderY)) return false;
  const float hitPadding = 8.0f * g_dpiScale;
  return x >= static_cast<int>(left - hitPadding) && x <= static_cast<int>(right + hitPadding) &&
    y >= static_cast<int>(sliderY - hitPadding) && y <= static_cast<int>(sliderY + hitPadding);
}

static void sendVolumeForSliderX(int x) {
  float left = 0, right = 0, sliderY = 0;
  if (!getVolumeSliderBounds(&left, &right, &sliderY)) return;
  const float width = std::max(1.0f, right - left);
  float volume = (static_cast<float>(x) - left) / width;
  volume = (volume < 0.0f) ? 0.0f : (volume > 1.0f) ? 1.0f : volume;
  char message[64] = {};
  snprintf(message, sizeof(message), "{\"type\":\"volume\",\"volume\":%.3f}", volume);
  sendJson(message);
}

// WinEvent callback: fires on foreground window change AND on object hide
static HWINEVENTHOOK g_winEventHook = nullptr;
static HWINEVENTHOOK g_objHideHook = nullptr;
static HWINEVENTHOOK g_locationHook = nullptr;
static UINT_PTR g_fastTimerId = 0;

static VOID CALLBACK winEventCallback(
  HWINEVENTHOOK hWinEventHook, DWORD event, HWND hwnd,
  LONG idObject, LONG idChild, DWORD dwEventThread, DWORD dwmsEventTime)
{
  (void)hWinEventHook;
  (void)idObject;
  (void)idChild;
  (void)dwEventThread;
  (void)dwmsEventTime;

  if (!g_hwnd) return;
  // Foreground change (Win+D, alt-tab, click other window)
  if (event == EVENT_SYSTEM_FOREGROUND) {
    bool fs = !g_ultraLightFloating.load() && isForegroundFullscreen();
    if (fs) {
      // Fullscreen window exists; set flag FIRST, then hide
      g_isFullscreen = true;
      if (g_hwnd) ShowWindow(g_hwnd, SW_HIDE);
    } else {
      g_isFullscreen = false;
      PostMessage(g_hwnd, WM_APP_REASSERT_TOPMOST, 0, 0);
    }
  }
  // Location/size change; recheck fullscreen (catches F11, maximize, etc.)
  if (event == EVENT_OBJECT_LOCATIONCHANGE && hwnd != g_hwnd) {
    bool fs = !g_ultraLightFloating.load() && isForegroundFullscreen();
    if (fs && !g_isFullscreen) {
      // Just entered fullscreen; set flag FIRST, then hide
      g_isFullscreen = true;
      if (g_hwnd) ShowWindow(g_hwnd, SW_HIDE);
    } else if (!fs && g_isFullscreen) {
      // Just exited fullscreen
      g_isFullscreen = false;
      if (g_visible) PostMessage(g_hwnd, WM_APP_REASSERT_TOPMOST, 0, 0);
    }
  }
  // Our window or any window in our process got hidden; re-show immediately
  // (but NOT if we are in fullscreen mode; we want to stay hidden)
  if (event == EVENT_OBJECT_HIDE && hwnd == g_hwnd && !g_isFullscreen) {
    PostMessage(g_hwnd, WM_APP_FAST_VISIBILITY, 0, 0);
  }
}

static void assertTopmost() {
  if (!g_hwnd) return;
  // Only reassert Z-order, do NOT use SWP_SHOWWINDOW here
  // to avoid triggering repaints on already-visible windows
  SetWindowPos(g_hwnd, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER |
    SWP_NOSENDCHANGING);

  // Win11 Start Menu / Search / Shell Flyouts use a higher DWM layer.
  // HWND_TOPMOST Z-order alone cannot beat them.
  // Try using BringWindowToTop which forces the window to the top of its Z group.
  BringWindowToTop(g_hwnd);
}

static void forceShowTopmost() {
  if (!g_hwnd) return;
  // For child windows (parented to WorkerW), ShowWindow is the reliable way.
  // SetWindowPos with HWND_TOPMOST is ignored for child windows but doesn't hurt.
  ShowWindow(g_hwnd, SW_SHOWNOACTIVATE);
  SetWindowPos(g_hwnd, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER |
    SWP_NOSENDCHANGING);
}

static void animationLoop() {
  HANDLE timer = CreateWaitableTimerW(nullptr, FALSE, nullptr);
  if (!timer) return;

  ULONGLONG lastTick = GetTickCount64();
  while (g_running) {
    const UINT intervalMs = g_ultraLightFloating.load()
      ? kUltraLightRenderIntervalMs
      : kRenderIntervalMs;
    LARGE_INTEGER dueTime = {};
    dueTime.QuadPart = -static_cast<LONGLONG>(intervalMs) * 10000LL;
    SetWaitableTimer(timer, &dueTime, 0, nullptr, nullptr, FALSE);
    DWORD wait = WaitForSingleObject(timer, intervalMs + 100);
    if (wait != WAIT_OBJECT_0) continue;

    ULONGLONG now = GetTickCount64();
    double delta = static_cast<double>(now - lastTick) / 1000.0;
    lastTick = now;
    if (delta > 0.05) delta = 0.05;

    bool animate = false;
    {
      std::lock_guard<std::mutex> lock(g_stateMutex);
      animate = g_visible && !g_isFullscreen && g_lyricsShouldAnimate.load();
      if (animate) {
        g_scrollTime += delta;
      } else {
        g_lastRenderTick = now;
      }
    }

    if (animate && g_hwnd) InvalidateRect(g_hwnd, nullptr, FALSE);
  }

  CancelWaitableTimer(timer);
  CloseHandle(timer);
}
// Window procedure

static void repositionWindow(); // forward declaration
static bool updateLayoutIfChanged();

static std::string shortcutKeyName(const WPARAM key) {
  if (key >= 'A' && key <= 'Z') return std::string(1, static_cast<char>(key));
  if (key >= '0' && key <= '9') return std::string(1, static_cast<char>(key));
  if (key >= VK_F1 && key <= VK_F24) return "F" + std::to_string(key - VK_F1 + 1);
  if (key >= VK_NUMPAD0 && key <= VK_NUMPAD9) return "num" + std::to_string(key - VK_NUMPAD0);
  switch (key) {
    case VK_SPACE: return "Space";
    case VK_LEFT: return "Left";
    case VK_RIGHT: return "Right";
    case VK_UP: return "Up";
    case VK_DOWN: return "Down";
    case VK_ESCAPE: return "Esc";
    case VK_RETURN: return "Enter";
    case VK_BACK: return "Backspace";
    case VK_TAB: return "Tab";
    case VK_ADD: return "numadd";
    case VK_SUBTRACT: return "numsub";
    case VK_MULTIPLY: return "nummult";
    case VK_DIVIDE: return "numdiv";
    case VK_DECIMAL: return "numdec";
    case VK_OEM_PLUS: return (GetKeyState(VK_SHIFT) & 0x8000) ? "Plus" : "=";
    case VK_OEM_MINUS: return "-";
    case VK_OEM_4: return "[";
    case VK_OEM_6: return "]";
    case VK_OEM_1: return ";";
    case VK_OEM_7: return "'";
    case VK_OEM_COMMA: return ",";
    case VK_OEM_PERIOD: return ".";
    case VK_OEM_2: return "/";
    case VK_OEM_5: return "\\";
    case VK_MEDIA_PLAY_PAUSE: return "MediaPlayPause";
    case VK_MEDIA_PREV_TRACK: return "MediaPreviousTrack";
    case VK_MEDIA_NEXT_TRACK: return "MediaNextTrack";
    case VK_MEDIA_STOP: return "MediaStop";
    case VK_VOLUME_UP: return "VolumeUp";
    case VK_VOLUME_DOWN: return "VolumeDown";
    case VK_VOLUME_MUTE: return "VolumeMute";
    default: return "";
  }
}

static void sendFocusedShortcut(const WPARAM key, const LPARAM keyData) {
  if (!g_ultraLightFloating.load() || (keyData & (1LL << 30)) != 0) return;
  const std::string name = shortcutKeyName(key);
  if (name.empty()) return;
  std::string accelerator;
  if (GetKeyState(VK_CONTROL) & 0x8000) accelerator += "Ctrl+";
  if (GetKeyState(VK_MENU) & 0x8000) accelerator += "Alt+";
  if (GetKeyState(VK_SHIFT) & 0x8000) accelerator += "Shift+";
  accelerator += name;
  sendJson("{\"type\":\"shortcut\",\"accelerator\":\"" + accelerator + "\"}");
}

static LRESULT CALLBACK wndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  switch (msg) {
    case WM_KEYDOWN:
    case WM_SYSKEYDOWN:
      sendFocusedShortcut(wParam, lParam);
      return 0;

    case WM_PAINT:
      render();
      ValidateRect(hwnd, nullptr);
      return 0;

    case WM_ERASEBKGND:
      return 1;

    case WM_MOUSEMOVE: {
      if (g_volumeDragActive) {
        const ULONGLONG now = GetTickCount64();
        if (now - g_lastVolumeSetAt >= 50) {
          sendVolumeForSliderX(GET_X_LPARAM(lParam));
          g_lastVolumeSetAt = now;
        }
        return 0;
      }
      if (g_progressDragActive) {
        const ULONGLONG now = GetTickCount64();
        if (now - g_lastProgressSeekAt >= 80) {
          sendSeekForProgressX(GET_X_LPARAM(lParam));
          g_lastProgressSeekAt = now;
        }
        return 0;
      }
      int btn = hitTestButton(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
      if (btn != g_hoveredButton) {
        g_hoveredButton = btn;
        InvalidateRect(hwnd, nullptr, FALSE);
      }
      TRACKMOUSEEVENT tme = {};
      tme.cbSize = sizeof(tme);
      tme.dwFlags = TME_LEAVE;
      tme.hwndTrack = hwnd;
      TrackMouseEvent(&tme);
      return 0;
    }

    case WM_MOUSELEAVE:
      g_hoveredButton = -1;
      InvalidateRect(hwnd, nullptr, FALSE);
      return 0;

    case WM_LBUTTONDOWN: {
      if (isVolumeHit(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam))) {
        g_volumeDragActive = true;
        g_lastVolumeSetAt = GetTickCount64();
        SetCapture(hwnd);
        sendVolumeForSliderX(GET_X_LPARAM(lParam));
        return 0;
      }
      if (isProgressHit(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam))) {
        g_progressDragActive = true;
        g_lastProgressSeekAt = GetTickCount64();
        SetCapture(hwnd);
        sendSeekForProgressX(GET_X_LPARAM(lParam));
        return 0;
      }
      int btn = hitTestButton(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
      if (btn == 0) sendJson("{\"type\":\"click\",\"action\":\"prev\"}");
      else if (btn == 1) sendJson("{\"type\":\"click\",\"action\":\"playPause\"}");
      else if (btn == 2) sendJson("{\"type\":\"click\",\"action\":\"next\"}");
      else if (btn == 3) sendJson("{\"type\":\"click\",\"action\":\"cycleOrder\"}");
      else if (btn == 4) {
        g_queueExpanded = !g_queueExpanded;
        HostWindowBounds bounds = calculateHostWindowBounds(hwnd);
        RECT currentRect = {};
        GetWindowRect(hwnd, &currentRect);
        SetWindowPos(hwnd, HWND_TOPMOST, currentRect.left, currentRect.top, bounds.width, bounds.height, SWP_NOACTIVATE);
        sendJson("{\"type\":\"click\",\"action\":\"toggleQueue\"}");
      }
      else if (btn == 5) sendJson("{\"type\":\"click\",\"action\":\"exitUltraLight\"}");
      else if (btn >= 100) {
        char message[72] = {};
        snprintf(message, sizeof(message), "{\"type\":\"queueItem\",\"index\":%d}", btn - 100);
        sendJson(message);
      }
      else if (g_ultraLightFloating.load()) {
        ReleaseCapture();
        SendMessage(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
      }
      return 0;
    }

    case WM_LBUTTONUP:
      if (g_volumeDragActive) {
        sendVolumeForSliderX(GET_X_LPARAM(lParam));
        g_volumeDragActive = false;
        ReleaseCapture();
        return 0;
      }
      if (g_progressDragActive) {
        sendSeekForProgressX(GET_X_LPARAM(lParam));
        g_progressDragActive = false;
        ReleaseCapture();
        return 0;
      }
      return 0;

    case WM_EXITSIZEMOVE:
      if (g_ultraLightFloating.load()) {
        RECT rect = {};
        if (GetWindowRect(hwnd, &rect)) {
          g_lastBounds = { rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top };
          g_lastBoundsValid = true;
          g_userPositionedFloating = true;
        }
      }
      return 0;

    case WM_LBUTTONDBLCLK: {
      int btn = hitTestButton(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
      if (btn < 0 && !g_ultraLightFloating.load()) {
        sendJson("{\"type\":\"doubleClick\"}");
      }
      return 0;
    }

    case WM_SIZE:
      resizeRenderTarget();
      InvalidateRect(hwnd, nullptr, FALSE);
      return 0;

    case WM_DPICHANGED: {
      // System DPI scale changed; update layout and reposition
      UINT newDpi = HIWORD(wParam);
      g_dpiScale = newDpi / 96.0f;
      applyDpiScale();
      recreateTextFormats();
      // Update render target DPI
      if (g_renderTarget) {
        g_renderTarget->SetDpi(96.0f, 96.0f);
        applyTextRenderingSettings();
      }
      // Force cover bitmap reload (bound to old render target state)
      g_loadedCoverPath.clear();
      // Reposition with new DPI-scaled dimensions
      repositionWindow();
      return 0;
    }

    case WM_TIMER:
      if (wParam == kPollTimerId) {
        updateLayoutIfChanged();

        // Check fullscreen state
        bool wasFullscreen = g_isFullscreen;
        g_isFullscreen = !g_ultraLightFloating.load() && isForegroundFullscreen();

        if (g_isFullscreen && !wasFullscreen) {
          // Entered fullscreen; hide immediately
          ShowWindow(g_hwnd, SW_HIDE);
        } else if (!g_isFullscreen && wasFullscreen) {
          // Exited fullscreen; show immediately
          if (g_visible) forceShowTopmost();
        }

        if (g_visible && !g_isFullscreen && !IsWindowVisible(g_hwnd)) forceShowTopmost();
      } else if (wParam == g_fastTimerId) {
        // Fast visibility check: recover only if the shell actually hid us.
        // Reasserting z-order every 16ms fights DWM composition and can make
        // scrolling text shimmer or flicker.
        if (g_visible && !g_isFullscreen && !IsWindowVisible(g_hwnd)) {
          forceShowTopmost();
        }
      } else if (wParam == kColorTimerId) {
        sampleTaskbarColor();
        if (!g_isFullscreen) InvalidateRect(hwnd, nullptr, FALSE);
      }
      return 0;

    case WM_APP_MODE_CHANGED:
      g_isFullscreen = false;
      g_userPositionedFloating = false;
      {
        LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if (g_ultraLightFloating.load()) exStyle &= ~static_cast<LONG_PTR>(WS_EX_NOACTIVATE);
        else exStyle |= WS_EX_NOACTIVATE;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, exStyle);
      }
      configureAppBarForCurrentMode();
      {
        const DWORD cornerPreference = g_ultraLightFloating.load() ? 2 : 0;
        DwmSetWindowAttribute(hwnd, static_cast<DWORD>(33), &cornerPreference, sizeof(cornerPreference));
      }
      if (g_fastTimerId) {
        KillTimer(hwnd, g_fastTimerId);
        SetTimer(hwnd, g_fastTimerId, g_ultraLightFloating.load() ? 250 : 16, nullptr);
      }
      KillTimer(hwnd, kPollTimerId);
      SetTimer(hwnd, kPollTimerId,
        g_ultraLightFloating.load() ? kUltraLightPollIntervalMs : kPollIntervalMs, nullptr);
      if (g_ultraLightFloating.load()) KillTimer(hwnd, kColorTimerId);
      else SetTimer(hwnd, kColorTimerId, kColorIntervalMs, nullptr);
      repositionWindow();
      if (g_visible) forceShowTopmost();
      return 0;

    case WM_APP_REASSERT_TOPMOST:
      // Foreground changed (Win+D, alt-tab); reassert Z-order
      if (g_visible && !g_isFullscreen) {
        if (!IsWindowVisible(g_hwnd)) forceShowTopmost();
        else assertTopmost();
      }
      return 0;

    case WM_APP_FAST_VISIBILITY:
      // Our window was hidden (EVENT_OBJECT_HIDE); show immediately
      if (g_visible && !g_isFullscreen) forceShowTopmost();
      return 0;

    case WM_WINDOWPOSCHANGING: {
      // Prevent the OS from hiding or lowering our z-order
      // BUT allow hiding when:
      //   1. We're in fullscreen mode, OR
      //   2. User explicitly requested hide (g_visible = false)
      WINDOWPOS* wp = reinterpret_cast<WINDOWPOS*>(lParam);
      if (wp && !g_isFullscreen && g_visible) {
        wp->flags &= ~SWP_HIDEWINDOW;
        wp->flags |= SWP_SHOWWINDOW;
        wp->hwndInsertAfter = HWND_TOPMOST;
        // Also prevent minimize and deactivate
        wp->flags &= ~SWP_NOACTIVATE;
      }
      return 0;
    }

    case WM_SETTINGCHANGE: {
      const bool hasArea = lParam != 0;
      const bool colorChanged = hasArea && wcscmp(reinterpret_cast<LPCWSTR>(lParam), L"ImmersiveColorSet") == 0;
      if (colorChanged) {
        sampleTaskbarColor();
        InvalidateRect(hwnd, nullptr, FALSE);
      }
      repositionWindow();
      return 0;
    }

    case WM_MINIMIZEALL:
      // Win+D "Minimize All"; ignore completely
      return 0;

    case WM_QUERYOPEN:
      // Prevent restore animation flicker
      return 1;

    case WM_SYSCOMMAND:
      // Reject SC_MINIMIZE to prevent the minimize/restore flicker loop
      if ((wParam & 0xFFF0) == SC_MINIMIZE) return 0;
      break;

    case WM_SHOWWINDOW:
      // When the OS tries to hide us, immediately reshow
      // BUT NOT when we're in fullscreen mode
      if (wParam == FALSE && lParam == SW_PARENTCLOSING && !g_isFullscreen) return 0;
      break;

    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;

    default:
      return DefWindowProc(hwnd, msg, wParam, lParam);
  }

  return DefWindowProc(hwnd, msg, wParam, lParam);
}

// Window creation

// Recalculate window position and size based on taskbar geometry
static bool boundsEqual(const HostWindowBounds& a, const HostWindowBounds& b) {
  return a.x == b.x && a.y == b.y && a.width == b.width && a.height == b.height;
}

static bool updateLayoutIfChanged() {
  if (!g_hwnd) return false;
  if (g_ultraLightFloating.load() && g_userPositionedFloating) return false;

  HostWindowBounds bounds = calculateHostWindowBounds(g_hwnd);
  if (g_lastBoundsValid && boundsEqual(bounds, g_lastBounds)) {
    return false;
  }

  g_lastBounds = bounds;
  g_lastBoundsValid = true;
  SetWindowPos(g_hwnd, HWND_TOPMOST, bounds.x, bounds.y, bounds.width, bounds.height,
    SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_NOSENDCHANGING);
  resizeRenderTarget();
  InvalidateRect(g_hwnd, nullptr, FALSE);
  return true;
}

static void repositionWindow() {
  g_lastBoundsValid = false;
  updateLayoutIfChanged();
}

static bool createWindow(HINSTANCE hInstance) {
  WNDCLASSEXW wc = {};
  wc.cbSize = sizeof(wc);
  wc.style = CS_DBLCLKS;
  wc.lpfnWndProc = wndProc;
  wc.hInstance = hInstance;
  wc.lpszClassName = kWindowClass;
  wc.hCursor = LoadCursor(nullptr, IDC_ARROW);

  ATOM wcAtom = RegisterClassExW(&wc);
  if (!wcAtom) return false;

  // Get initial DPI scale for window size calculation
  HMONITOR hmon = MonitorFromWindow(nullptr, MONITOR_DEFAULTTOPRIMARY);
  UINT dpi = 96;
  GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &dpi, &dpi);
  g_dpiScale = dpi / 96.0f;
  applyDpiScale();


  HostWindowBounds bounds = calculateHostWindowBounds(nullptr);
  g_lastBounds = bounds;
  g_lastBoundsValid = true;
  int x = bounds.x;
  int y = bounds.y;
  int width = bounds.width;
  int height = bounds.height;
  const DWORD experimentalBand = g_ultraLightFloating.load()
    ? kNoExperimentalWindowBand
    : resolveExperimentalWindowBand();
  // The normal taskbar host must never steal focus. Ultralight is an actual
  // floating control window, so it must be focusable for its local shortcuts.
  const DWORD windowExStyle = WS_EX_TOOLWINDOW | WS_EX_TOPMOST |
    (g_ultraLightFloating.load() ? 0 : WS_EX_NOACTIVATE);
  bool createdWithBand = false;

  if (experimentalBand != kNoExperimentalWindowBand) {
    using CreateWindowInBandFn = HWND (WINAPI *)(DWORD, ATOM, LPCWSTR, DWORD, int, int, int, int, HWND, HMENU, HINSTANCE, LPVOID, DWORD);
    HMODULE user32 = GetModuleHandleW(L"user32.dll");
    auto createWindowInBand = user32
      ? reinterpret_cast<CreateWindowInBandFn>(GetProcAddress(user32, "CreateWindowInBand"))
      : nullptr;

    if (createWindowInBand) {
      SetLastError(ERROR_SUCCESS);
      g_hwnd = createWindowInBand(windowExStyle, wcAtom, kWindowTitle, WS_POPUP,
        x, y, width, height, nullptr, nullptr, hInstance, nullptr, experimentalBand);
      if (g_hwnd) {
        char msg[160];
        sprintf_s(msg, "Created experimental window band=%lu", experimentalBand);
        logHostMsg(msg);
        createdWithBand = true;
        fprintf(stderr, "[taskbar-host] Created experimental window band=%lu\n", experimentalBand);
      } else {
        DWORD err = GetLastError();
        char msg[192];
        sprintf_s(msg, "CreateWindowInBand band=%lu failed: %lu; falling back", experimentalBand, err);
        logHostMsg(msg);
        fprintf(stderr, "[taskbar-host] CreateWindowInBand band=%lu failed: %lu; falling back\n",
          experimentalBand, err);
      }
    } else {
      logHostMsg("CreateWindowInBand unavailable; falling back");
      fprintf(stderr, "[taskbar-host] CreateWindowInBand unavailable; falling back\n");
    }
  }

  if (!g_hwnd) {
    g_hwnd = CreateWindowExW(
      windowExStyle,
      kWindowClass, kWindowTitle,
      WS_POPUP,
      x, y, width, height,
      nullptr, nullptr, hInstance, nullptr);
  }

  if (!g_hwnd) {
    logHostMsg("Create taskbar host window failed");
    return false;
  }

  if (experimentalBand != kNoExperimentalWindowBand) {
    logHostMsg(createdWithBand ? "Taskbar host window ready in experimental band" : "Taskbar host window ready after fallback");
  }

  // Enable DWM per-pixel alpha transparency (without WS_EX_LAYERED).
  // DwmExtendFrameIntoClientArea with margins={-1} makes the entire window
  // a DWM glass surface; Direct2D can render with premultiplied alpha if needed.
  // and DWM will composite it with per-pixel transparency.
  MARGINS margins = { -1 };
  DwmExtendFrameIntoClientArea(g_hwnd, &margins);
  if (g_ultraLightFloating.load()) {
    const DWORD roundPreference = 2; // DWMWCP_ROUND on Windows 11; ignored elsewhere.
    DwmSetWindowAttribute(g_hwnd, static_cast<DWORD>(33), &roundPreference, sizeof(roundPreference));
  }

  if (!initD2D()) return false;

  ShowWindow(g_hwnd, SW_SHOWNOACTIVATE);
  SetWindowPos(g_hwnd, HWND_TOPMOST, 0, 0, 0, 0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

  // Register as AppBar only in taskbar mode. Floating mode must remain movable.
  configureAppBarForCurrentMode();

  return true;
}

// IPC thread

static void ipcThread() {
  std::string line;
  while (g_running) {
    int c = EOF;
    line.clear();
    while (g_running && (c = getchar()) != EOF && c != '\n') {
      line += static_cast<char>(c);
    }
    if (c == EOF && line.empty()) break;
    if (line.empty()) continue;

    std::string type = extractJsonString(line, "type");
    if (type == "state") {
      std::string title = extractJsonString(line, "title");
      std::string artist = extractJsonString(line, "artist");
      std::string lyrics = extractJsonString(line, "lyrics");
      std::string coverPath = extractJsonString(line, "coverPath");
      std::string queueText = extractJsonString(line, "queueText");
      std::string playbackOrder = extractJsonString(line, "playbackOrder");
      std::string playbackOrderMode = extractJsonString(line, "playbackOrderMode");
      std::string colorScheme = extractJsonString(line, "colorScheme");
      const bool hasVolume = line.find("\"volume\":") != std::string::npos;
      const double volume = extractJsonNumber(line, "volume");
      bool playing = extractJsonBool(line, "playing");
      double position = extractJsonNumber(line, "position");
      double duration = extractJsonNumber(line, "duration");

      {
        std::lock_guard<std::mutex> lock(g_stateMutex);
        g_state.title = title.empty() ? L"No Track" : utf8ToWide(title);
        g_state.artist = utf8ToWide(artist);
        std::wstring newLyrics = utf8ToWide(lyrics);
        if (newLyrics != g_state.lyrics) {
          g_scrollTime = 0.0;
          g_lastLyricsText.clear();
          g_lyricsShouldAnimate = false;
        }
        g_state.lyrics = newLyrics;
        g_state.coverPath = utf8ToWide(coverPath);
        g_state.queueText = utf8ToWide(queueText);
        g_state.queueCurrentIndex = static_cast<int>(extractJsonNumber(line, "queueCurrentIndex"));
        g_state.playbackOrder = playbackOrder.empty() ? L"顺序播放" : utf8ToWide(playbackOrder);
        g_state.playbackOrderMode = playbackOrderMode.empty() ? L"sequential" : utf8ToWide(playbackOrderMode);
        g_state.colorScheme = colorScheme == "dark" ? L"dark" : L"light";
        if (hasVolume && std::isfinite(volume)) {
          g_state.volume = std::max(0.0, std::min(1.0, volume));
        }
        g_state.playing = playing;
        g_state.position = position;
        g_state.duration = duration;
      }
      int queueItemCount = queueText.empty() ? 0 : 1;
      for (char c : queueText) if (c == '\n') queueItemCount++;
      g_queueItemCount = queueItemCount;
      if (g_hwnd) InvalidateRect(g_hwnd, nullptr, FALSE);
    } else if (type == "show") {
      g_visible = true;
      if (g_hwnd) {
        ShowWindow(g_hwnd, SW_SHOWNOACTIVATE);
        SetWindowPos(g_hwnd, HWND_TOPMOST, 0, 0, 0, 0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      }
    } else if (type == "hide") {
      g_visible = false;
      if (g_hwnd) ShowWindow(g_hwnd, SW_HIDE);
    } else if (type == "mode") {
      const std::string mode = extractJsonString(line, "mode");
      g_ultraLightFloating = mode == "ultra-light-floating";
      if (g_hwnd) PostMessage(g_hwnd, WM_APP_MODE_CHANGED, 0, 0);
    } else if (type == "quit") {
      g_running = false;

      if (g_hwnd) PostMessage(g_hwnd, WM_CLOSE, 0, 0);
      break;
    }
  }
  g_running = false;

}

// Main

int main() {
  // Set DPI awareness BEFORE creating any windows or Direct2D resources
  // This is the critical fix for blurry rendering on high-DPI displays
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  g_ultraLightFloating = resolveUltraLightFloatingMode();

  CoInitialize(nullptr);

  HINSTANCE hInstance = GetModuleHandle(nullptr);

  if (!createWindow(hInstance)) {
    return 1;
  }

  sendJson("{\"type\":\"ready\"}");

  std::thread ipc(ipcThread);
  g_animationThread = std::thread(animationLoop);

  // Sample taskbar color immediately, then every 5 seconds
  if (!g_ultraLightFloating.load()) sampleTaskbarColor();
  SetTimer(g_hwnd, kPollTimerId,
    g_ultraLightFloating.load() ? kUltraLightPollIntervalMs : kPollIntervalMs, nullptr);
  if (!g_ultraLightFloating.load()) SetTimer(g_hwnd, kColorTimerId, kColorIntervalMs, nullptr);

  // Install WinEvent hooks for immediate topmost reassert
  // Hook 1: foreground change (Win+D, alt-tab, window switch)
  g_winEventHook = SetWinEventHook(
    EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND,
    nullptr, winEventCallback,
    0, 0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);

  // Hook 2: object hide (catches when our window gets hidden by OS)
  g_objHideHook = SetWinEventHook(
    EVENT_OBJECT_HIDE, EVENT_OBJECT_HIDE,
    nullptr, winEventCallback,
    GetCurrentProcessId(), 0,
    WINEVENT_OUTOFCONTEXT);

  // Hook 3: location/size change; catches F11 fullscreen, maximize, etc.
  // (these don't trigger EVENT_SYSTEM_FOREGROUND since the window is already foreground)
  g_locationHook = SetWinEventHook(
    EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_LOCATIONCHANGE,
    nullptr, winEventCallback,
    0, 0,
    WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS);

  // Fast visibility-check timer (16ms / 60fps): checks IsWindowVisible only,
  // only calls SetWindowPos when window is actually hidden. Near-zero overhead.
  g_fastTimerId = 100;
  SetTimer(g_hwnd, g_fastTimerId, g_ultraLightFloating.load() ? 250 : 16, nullptr);

  MSG msg;
  while (g_running && GetMessage(&msg, nullptr, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessage(&msg);
  }

  g_running = false;

  if (g_animationThread.joinable()) {
    g_animationThread.join();
  }

  if (g_winEventHook) {
    UnhookWinEvent(g_winEventHook);
    g_winEventHook = nullptr;
  }
  if (g_objHideHook) {
    UnhookWinEvent(g_objHideHook);
    g_objHideHook = nullptr;
  }
  if (g_locationHook) {
    UnhookWinEvent(g_locationHook);
    g_locationHook = nullptr;
  }

  // Unregister AppBar
  if (g_appBarRegistered && g_hwnd) {
    APPBARDATA abd = {};
    abd.cbSize = sizeof(abd);
    abd.hWnd = g_hwnd;
    SHAppBarMessage(ABM_REMOVE, &abd);
    g_appBarRegistered = false;
  }

  if (g_hwnd) {
    DestroyWindow(g_hwnd);
    g_hwnd = nullptr;
  }

  cleanupD2D();
  UnregisterClassW(kWindowClass, hInstance);
  CoUninitialize();

  if (ipc.joinable()) ipc.detach();

  return 0;
}
