module.exports = {
  apps: [
    {
      name: 'box2bitable-server',
      script: 'src/app.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
