echo.commands.register('show-status', { title: '显示播放状态' }, async () => {
  const status = await echo.playback.getStatus();
  await echo.ui.notify(`当前状态: ${status.state}`);
  return { state: status.state, trackId: status.currentTrackId };
});
