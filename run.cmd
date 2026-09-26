@echo off
setlocal
set "PYTHONPATH=%~dp0src"
set "PYTHON_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if not exist "%PYTHON_EXE%" (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3.10+ introuvable. Installer Python depuis python.org puis relancer.
    exit /b 1
  )
  set "PYTHON_EXE=python"
)
if "%~1"=="--test" (
  "%PYTHON_EXE%" -m unittest discover -s "%~dp0tests" -v
) else (
  "%PYTHON_EXE%" -m ais_race.app %*
)
