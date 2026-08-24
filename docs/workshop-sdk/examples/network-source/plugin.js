echo.sources.registerProvider('owned-radio', { title: 'Owned radio catalog' }, {
  search: async ({ query }) => {
    const response = await echo.network.get(`https://audio.example.invalid/catalog?q=${encodeURIComponent(query || '')}`);
    const payload = JSON.parse(response.body);
    const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
    return { tracks, total: tracks.length, hasMore: false };
  },
  resolve: async ({ providerTrackId }) => ({
    url: `https://audio.example.invalid/streams/${encodeURIComponent(providerTrackId)}.mp3`,
    title: 'Authorized stream',
    artist: 'Workshop provider',
    live: true,
  }),
});
