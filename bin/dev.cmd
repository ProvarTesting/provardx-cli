@echo off
set NODE_ENV=development
export NODE_OPTIONS='--inspect-brk'
node "%~dp0\dev" %*
