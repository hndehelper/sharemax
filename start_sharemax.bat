@echo off
title ShareMax - Local Wi-Fi File Sharing (0 KB Data)
cls
echo ============================================================
echo           Starting ShareMax Local Wi-Fi Server...
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
