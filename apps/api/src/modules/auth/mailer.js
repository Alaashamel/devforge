export function createMailer({
  logger,
  isProduction = false,
  webBaseUrl = 'http://localhost:5173',
}) {
  function deliver({ to, subject, path, token }) {
    if (!isProduction) {
      const url = `${webBaseUrl}${path}${encodeURIComponent(token)}`;
      logger.info({ to, subject, url }, 'mailer: email would be sent (dev delivery)');
      return { url };
    }
    logger.warn({ to, subject }, 'mailer: email delivery not configured; token generated only');
    return null;
  }

  return {
    sendVerification(email, token) {
      return deliver({
        to: email,
        subject: 'Verify your DevForge account',
        path: '/verify-email?token=',
        token,
      });
    },
    sendPasswordReset(email, token) {
      return deliver({
        to: email,
        subject: 'Reset your DevForge password',
        path: '/reset-password?token=',
        token,
      });
    },
  };
}
