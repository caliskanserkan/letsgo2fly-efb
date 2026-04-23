const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use('/api/wxr', createProxyMiddleware({
    target: 'https://aviationweather.gov',
    changeOrigin: true,
    secure: true,
    on: {
      proxyReq: (proxyReq, req) => {
        const ids  = req.query.ids  || '';
        const type = req.query.type || 'metar';
        const path = type === 'taf'
          ? `/api/data/taf?ids=${ids}&format=raw`
          : `/api/data/metar?ids=${ids}&format=raw&hours=2`;
        proxyReq.path = path;
      }
    }
  }));
};
