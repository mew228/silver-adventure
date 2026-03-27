const { execSync } = require('child_process');

const envs = {
  AUTH0_CLIENT_ID: 'JVRTuxTv4LqZfOy1OaclhqySvLoFDl9Q',
  AUTH0_CLIENT_SECRET: 'VMeK6ALWPINB-OR0T7rwf_Ghg7NYpxVwdSS0u0V0rxsDeW1j4_9ILPCFfvu8mbTM',
  AUTH0_ISSUER_BASE_URL: 'https://dev-byy8ze506bhjcros.us.auth0.com',
  AUTH0_BASE_URL: 'https://bridgekeeper.vercel.app',
  AUTH0_SECRET: 'f3d9b54b2d398f869f6eebfa81cf05d3b6a22c544e43b12ea6cbdfe58a2d18af'
};

for (const [key, val] of Object.entries(envs)) {
  console.log(`Removing ${key}...`);
  try {
    execSync(`npx vercel env rm ${key} production --yes`, { stdio: 'ignore' });
  } catch (e) {}
  
  console.log(`Setting ${key}...`);
  execSync(`node -e "process.stdout.write('${val}')" | npx vercel env add ${key} production`, { stdio: 'inherit' });
}
console.log('Environment variables fixed!');
