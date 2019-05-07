const CriticalCssWebpackPlugin = require('../index.js')

module.exports = {
  output: {
    filename: '[name].[hash].js',
  },
  plugins: [
    new CriticalCssWebpackPlugin({
        urls: {
          testUrl: 'https://www.google.com/',
          testUrl2: 'https://github.com/',
        },
      },
    ),
  ],
}
