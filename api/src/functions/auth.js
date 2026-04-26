const { app } = require('@azure/functions');
const jwt = require('jsonwebtoken');

const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const OWNER_GITHUB = process.env.OWNER_GITHUB_USERNAME;
const OWNER_EMAIL = process.env.OWNER_EMAIL;

app.http('auth-start', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth',
  handler: async () => {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      scope: 'read:user'
    });
    return {
      status: 302,
      headers: { Location: `https://github.com/login/oauth/authorize?${params}` }
    };
  }
});

app.http('auth-callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/callback',
  handler: async (request) => {
    const code = new URL(request.url).searchParams.get('code');
    if (!code) return { status: 400, body: 'Missing code' };

    // Exchange code for GitHub access token (client_secret stays server-side)
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return { status: 400, body: 'GitHub auth failed' };

    // Fetch GitHub user profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'noodle-classifier'
      }
    });
    const user = await userRes.json();

    const payload = {
      sub: String(user.id),
      login: user.login,
      name: user.name || user.login,
      avatar: user.avatar_url,
      isOwner: user.login === OWNER_GITHUB
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    // Return to frontend with token in URL hash; frontend stores it in localStorage
    return {
      status: 302,
      headers: { Location: `/#token=${token}` }
    };
  }
});

app.http('google-auth-start', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/google',
  handler: async (request) => {
    const origin = new URL(request.url).origin;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${origin}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online'
    });
    return {
      status: 302,
      headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }
    };
  }
});

app.http('google-auth-callback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/google/callback',
  handler: async (request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (!code) return { status: 400, body: 'Missing code' };

    const origin = url.origin;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      }).toString()
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return { status: 400, body: 'Google auth failed' };

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const user = await userRes.json();

    const payload = {
      sub: `google:${user.id}`,
      name: user.name,
      avatar: user.picture,
      isOwner: user.email === OWNER_EMAIL
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    return {
      status: 302,
      headers: { Location: `/#token=${token}` }
    };
  }
});
