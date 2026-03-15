# CMakeList.txt: app 에 대한 CMake 프로젝트, 여기에 소스를 포함하고
# 프로젝트 특정 논리를 정의합니다.
#

#[=[
if (CMAKE_VERSION VERSION_GREATER 3.12)
  set_property(TARGET ${PROJECT_NAME} PROPERTY CXX_STANDARD 20)
endif()
#]=]

project(app)

#message(${PROJECT_NAME})
message("\n***********************************")
message("CMake for \"" ${PROJECT_NAME} "\" is running!")
message("src dir: " ${CMAKE_CURRENT_SOURCE_DIR})
message("bin dir: " ${CMAKE_CURRENT_BINARY_DIR})
message("C++ Standard: ${CMAKE_CXX_STANDARD}")
message("***********************************")

if (USE_IMGUI)
message("app USE_IMGUI")
endif()

#if (WIN32)
#	configure_file(${CMAKE_CURRENT_SOURCE_DIR}/config_app.h.in ${CMAKE_CURRENT_SOURCE_DIR}/inc/windows/config_app.h)
#elseif (EMSCRIPTEN)
#	configure_file(${CMAKE_CURRENT_SOURCE_DIR}/config_app.h.in ${CMAKE_CURRENT_SOURCE_DIR}/inc/wasm/config_app.h)
#endif()

# 이 프로젝트의 실행 파일에 소스를 추가합니다.
add_library(${PROJECT_NAME} STATIC src/app.cpp inc/app.h
	#src/temp_code.cpp
	#inc/temp_code.h
)

#target_sources(${PROJECT_NAME} PUBLIC
target_sources(${PROJECT_NAME} PRIVATE
	src/temp_code.cpp
	inc/temp_code.h

	src/common_temp_n.cpp
	inc/common_temp_n.h

	src/C3DObject.cpp
	inc/C3DObject.h

	src/global.cpp
	inc/global.h

	src/VertexData.cpp
	inc/VertexData.h

	src/VBO.cpp
	inc/VBO.h

	src/VAO.cpp
	inc/VAO.h

	src/Shader.cpp
	inc/Shader.h

	src/shader_tri.cpp
	inc/shader_tri.h

	src/shader_tri_instanced.cpp
	inc/shader_tri_instanced.h

	src/shader_line.cpp
	inc/shader_line.h

	src/shader_line_poly.cpp
	inc/shader_line_poly.h

	src/shader_texture_copy.cpp
	inc/shader_texture_copy.h

	src/shader_outline.cpp
	inc/shader_outline.h

	src/shader_set.cpp
	inc/shader_set.h

	src/Texture.cpp
	inc/Texture.h

	#move to common

	src/CExcavator.cpp
	inc/CExcavator.h

	src/FBO.cpp
	inc/FBO.h

	src/sqlite/sqlite3.c
	src/sqlite/sqlite3.h
	src/sqlite/sqlite3ext.h
)

if (WIN32)
	set(PLATFORM_NAME win)
elseif (EMSCRIPTEN)
	set(PLATFORM_NAME wasm)
endif()

#=================================
#out-of-tree: must specify binary directory
add_subdirectory (../../sdk/common ../../../../../sdk/common/build/${PLATFORM_NAME}/${build_config})  #src dir is relative to current dir, binary dir is relative to output dir
#=================================

if (WIN32)
#[=[
	if(CMAKE_BUILD_TYPE STREQUAL "Debug")
		set(OPENSSL_ROOT_DIR D:/openssl-sdk/lib/x64/Debug)
	elseif(CMAKE_BUILD_TYPE STREQUAL "Release")
		set(OPENSSL_ROOT_DIR D:/openssl-sdk/lib/x64/Release)
	elseif(CMAKE_BUILD_TYPE STREQUAL "RelWithDebInfo")
		set(OPENSSL_ROOT_DIR D:/openssl-sdk/lib/x64/Release)
	elseif(CMAKE_BUILD_TYPE STREQUAL "MinSizeRel")
		set(OPENSSL_ROOT_DIR D:/openssl-sdk/lib/x64/Release)
	else()
		message(WARNING "Unknown build type.")
	endif()
#]=]

	target_link_libraries(${PROJECT_NAME} PRIVATE Crypt32)

	set(OPENSSL_ROOT_DIR D:/openssl-sdk/lib/x64/Release)
	set(NO_EXAMPLES ON)
	set(NO_TESTS ON)
	set(NO_MEDIA ON)

	add_subdirectory (
		../../sdk/libdatachannel ../../../../../sdk/libdatachannel/build/${PLATFORM_NAME}/${build_config} EXCLUDE_FROM_ALL
	)  #src dir is relative to current dir, binary dir is relative to output dir

	target_link_libraries(${PROJECT_NAME} PRIVATE datachannel-static)
	#target_link_libraries(${PROJECT_NAME} PUBLIC datachannel-static)

	target_include_directories(${PROJECT_NAME} PUBLIC ../../sdk/libdatachannel/include)
elseif (EMSCRIPTEN)
	add_subdirectory (
		../../sdk/datachannel-wasm ../../../../../sdk/datachannel-wasm/build/${PLATFORM_NAME}/${build_config} EXCLUDE_FROM_ALL
	)  #src dir is relative to current dir, binary dir is relative to output dir

	target_link_libraries(${PROJECT_NAME} PRIVATE datachannel-wasm)
	#no need to set include dir below (datachannel-wasm's CMakeLists.txt sets it)
	target_include_directories(${PROJECT_NAME} PUBLIC ../../sdk/datachannel-wasm/wasm/include)
#message("APP: Emscripten...")
endif()

if (USE_FREETYPE)
##[=[
if (NOT EMSCRIPTEN)
	# Save original value (could be empty if unset)
	set(_original_BUILD_SHARED_LIBS "${BUILD_SHARED_LIBS}")

	# Print for debugging
	message("Original BUILD_SHARED_LIBS = ${_original_BUILD_SHARED_LIBS}")

	# If it's ON, set it to OFF temporarily
	if(BUILD_SHARED_LIBS)
		set(BUILD_SHARED_LIBS OFF CACHE BOOL "Temporarily disable shared libs" FORCE)
		message("Temporarily setting BUILD_SHARED_LIBS to OFF")
	endif()
endif()

# Disable optional FreeType dependencies before adding the subproject
set(FT_DISABLE_ZLIB TRUE CACHE BOOL "Disable ZLIB support in FreeType" FORCE)
set(FT_DISABLE_BZIP2 TRUE CACHE BOOL "Disable BZIP2 support in FreeType" FORCE)
set(FT_DISABLE_PNG TRUE CACHE BOOL "Disable PNG support in FreeType" FORCE)
set(FT_DISABLE_HARFBUZZ TRUE CACHE BOOL "Disable HarfBuzz support in FreeType" FORCE)
set(FT_DISABLE_BROTLI TRUE CACHE BOOL "Disable Brotli support in FreeType" FORCE)

#=================================
#out-of-tree: must specify binary directory
add_subdirectory (../../sdk/freetype-master ../../../../../sdk/freetype-master/build/${PLATFORM_NAME}/${build_config})  #src dir is relative to current dir, binary dir is relative to output dir
#=================================

if (NOT EMSCRIPTEN)
	# Restore original value if needed
	if(_original_BUILD_SHARED_LIBS)
		set(BUILD_SHARED_LIBS "${_original_BUILD_SHARED_LIBS}" CACHE BOOL "Restoring original shared libs setting" FORCE)
		message("Restored BUILD_SHARED_LIBS to ${_original_BUILD_SHARED_LIBS}")
	endif()
endif()
#]=]

target_include_directories(${PROJECT_NAME} PUBLIC
	#../../sdk/freetype-master/include #???
)
endif()

target_link_libraries(${PROJECT_NAME} PUBLIC
    common
)

target_include_directories(${PROJECT_NAME} PUBLIC
	./inc
	./src/sqlite

#	../../sdk/lua-5.4.7/src
#	${BULLET_PHYSICS_SOURCE_DIR}/src

	../../sdk/libdatachannel/deps/json/include
	#../../sdk/libdatachannel/include
)

target_include_directories(${PROJECT_NAME} PUBLIC
							inc/${PLATFORM_NAME})

if (WIN32)
elseif (EMSCRIPTEN)
endif()

#[=[
if (USE_IMGUI)
	if (WIN32 OR EMSCRIPTEN)
		target_include_directories(${PROJECT_NAME} PUBLIC
									../../sdk/imgui-docking
#									../../sdk/imgui-docking/backends 
		)

		target_sources(${PROJECT_NAME} PUBLIC
						../../sdk/imgui-docking/backends/imgui_impl_opengl3.cpp
						../../sdk/imgui-docking/backends/imgui_impl_opengl3.cpp
						../../sdk/imgui-docking/backends/imgui_impl_opengl3.h
						../../sdk/imgui-docking/backends/imgui_impl_opengl3_loader.h

						../../sdk/imgui-docking/imconfig.h
						../../sdk/imgui-docking/imgui.cpp
						../../sdk/imgui-docking/imgui.h

						../../sdk/imgui-docking/imgui_demo.cpp

						../../sdk/imgui-docking/imgui_draw.cpp
						../../sdk/imgui-docking/imgui_internal.h

						../../sdk/imgui-docking/imgui_tables.cpp
						../../sdk/imgui-docking/imgui_widgets.cpp

						../../sdk/imgui-docking/imstb_rectpack.h
						../../sdk/imgui-docking/imstb_textedit.h
						../../sdk/imgui-docking/imstb_truetype.h
		)
		message("USE_IMGUI WIN32 OR EMSCRIPTEN ../../sdk/imgui-docking/backends")
	endif()

	if (WIN32)
		target_sources(${PROJECT_NAME} PUBLIC
						../../sdk/imgui-docking/backends/imgui_impl_win32.cpp
						../../sdk/imgui-docking/backends/imgui_impl_win32.h
		)
		message("USE_IMGUI Windows")
	elseif (EMSCRIPTEN)
		message("USE_IMGUI Emscripten")
	endif()
endif()
#]=]

if (USE_TOOL)
	if (WIN32)
	endif()
endif()

target_sources(${PROJECT_NAME} PUBLIC
)

# TODO: 필요한 경우 테스트를 추가하고 대상을 설치합니다.
