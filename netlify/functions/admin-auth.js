exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' })
    };
  }

  try {
    const expectedPassword = process.env.ADMIN_ORDERS_PASSWORD;

    if (!expectedPassword) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'ADMIN_PASSWORD_NOT_CONFIGURED'
        })
      };
    }

    const payload = event.body ? JSON.parse(event.body) : {};
    const submittedPassword = typeof payload.password === 'string' ? payload.password : '';

    if (submittedPassword === expectedPassword) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'INVALID_PASSWORD' })
    };
  } catch (error) {
    console.error('[admin-auth] Unhandled error', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'AUTH_INTERNAL_ERROR' })
    };
  }
};
