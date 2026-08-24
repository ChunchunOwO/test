cmake_minimum_required(VERSION 3.24)

project(echo_sdm_quality_lab VERSION 0.1.0 LANGUAGES CXX)

add_executable(echo-sdm-quality-lab
  main.cpp
  ../../../audio-engine/NativeFormatProcessor.cpp
)

target_compile_features(echo-sdm-quality-lab PRIVATE cxx_std_20)
target_include_directories(echo-sdm-quality-lab PRIVATE ../../../audio-engine)

if(MSVC)
  set_property(TARGET echo-sdm-quality-lab PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
  target_compile_options(echo-sdm-quality-lab PRIVATE /W4 /permissive-)
else()
  target_compile_options(echo-sdm-quality-lab PRIVATE -Wall -Wextra -Wpedantic)
endif()
