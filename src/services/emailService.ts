import nodemailer from 'nodemailer';
import crypto from 'crypto';

// ============================================
// EMAIL SERVICE - SMTP via Gmail
// ============================================

// Configurazione SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // App password, non password normale
  },
});

// URL base frontend
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ofwd.asuscomm.com';

// ============================================
// GENERA TOKEN SICURO
// ============================================
export const generateToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// ============================================
// VERIFICA CONFIGURAZIONE SMTP
// ============================================
export const verifyEmailConfig = async (): Promise<boolean> => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('⚠️ Email service: SMTP credentials not configured');
    return false;
  }

  try {
    await transporter.verify();
    console.log('✅ Email service: SMTP configuration verified');
    return true;
  } catch (error) {
    console.error('❌ Email service: SMTP verification failed', error);
    return false;
  }
};

// ============================================
// TEMPLATE EMAIL - VERIFICA EMAIL
// ============================================
const getVerificationEmailHTML = (nome: string, verificationLink: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verifica la tua email - OmniaPi</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a09;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a09; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 500px; background: linear-gradient(145deg, rgba(20, 18, 15, 0.95), rgba(15, 14, 12, 0.98)); border-radius: 24px; border: 1px solid rgba(106, 212, 160, 0.2); box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <div style="width: 60px; height: 60px; margin: 0 auto 20px; background: linear-gradient(145deg, rgba(106, 212, 160, 0.3), rgba(106, 212, 160, 0.1)); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">🏠</span>
              </div>
              <h1 style="margin: 0; color: #6ad4a0; font-size: 28px; font-weight: 700;">OmniaPi</h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.5); font-size: 14px;">Home Domotica</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <h2 style="margin: 0 0 16px; color: #ffffff; font-size: 20px; font-weight: 600;">Ciao ${nome}! 👋</h2>
              <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.6;">
                Grazie per esserti registrato su OmniaPi. Per completare la registrazione e attivare il tuo account, verifica il tuo indirizzo email cliccando il pulsante qui sotto.
              </p>

              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${verificationLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #a0e8c4, #6ad4a0); color: #0a0a09; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 15px rgba(106, 212, 160, 0.3);">
                      ✓ Verifica Email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px; color: rgba(255, 255, 255, 0.5); font-size: 13px; line-height: 1.5;">
                Se il pulsante non funziona, copia e incolla questo link nel tuo browser:
              </p>
              <p style="margin: 0 0 24px; padding: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; word-break: break-all;">
                <a href="${verificationLink}" style="color: #6ad4a0; font-size: 12px; text-decoration: none;">${verificationLink}</a>
              </p>

              <p style="margin: 0; color: rgba(255, 255, 255, 0.4); font-size: 12px;">
                ⏰ Questo link scade tra 24 ore.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid rgba(106, 212, 160, 0.1);">
              <p style="margin: 0; color: rgba(255, 255, 255, 0.4); font-size: 12px; text-align: center;">
                Se non hai creato un account su OmniaPi, puoi ignorare questa email.
              </p>
              <p style="margin: 12px 0 0; color: rgba(255, 255, 255, 0.3); font-size: 11px; text-align: center;">
                © 2026 OmniaPi - Home Domotica
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ============================================
// TEMPLATE EMAIL - RESET PASSWORD
// ============================================
const getResetPasswordEmailHTML = (nome: string, resetLink: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password - OmniaPi</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a09;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a09; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 500px; background: linear-gradient(145deg, rgba(20, 18, 15, 0.95), rgba(15, 14, 12, 0.98)); border-radius: 24px; border: 1px solid rgba(106, 212, 160, 0.2); box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <div style="width: 60px; height: 60px; margin: 0 auto 20px; background: linear-gradient(145deg, rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.1)); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">🔐</span>
              </div>
              <h1 style="margin: 0; color: #6ad4a0; font-size: 28px; font-weight: 700;">OmniaPi</h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.5); font-size: 14px;">Reset Password</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <h2 style="margin: 0 0 16px; color: #ffffff; font-size: 20px; font-weight: 600;">Ciao ${nome}!</h2>
              <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.6;">
                Abbiamo ricevuto una richiesta di reset della password per il tuo account. Clicca il pulsante qui sotto per impostare una nuova password.
              </p>

              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${resetLink}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #fca5a5, #ef4444); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3);">
                      🔑 Reimposta Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px; color: rgba(255, 255, 255, 0.5); font-size: 13px; line-height: 1.5;">
                Se il pulsante non funziona, copia e incolla questo link nel tuo browser:
              </p>
              <p style="margin: 0 0 24px; padding: 12px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; word-break: break-all;">
                <a href="${resetLink}" style="color: #ef4444; font-size: 12px; text-decoration: none;">${resetLink}</a>
              </p>

              <p style="margin: 0; color: rgba(255, 255, 255, 0.4); font-size: 12px;">
                ⏰ Questo link scade tra 1 ora.
              </p>
            </td>
          </tr>

          <!-- Security Notice -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="padding: 16px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 12px;">
                <p style="margin: 0; color: #f59e0b; font-size: 13px;">
                  ⚠️ <strong>Nota di sicurezza:</strong> Se non hai richiesto il reset della password, ignora questa email. La tua password rimarrà invariata.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; border-top: 1px solid rgba(106, 212, 160, 0.1);">
              <p style="margin: 0; color: rgba(255, 255, 255, 0.3); font-size: 11px; text-align: center;">
                © 2026 OmniaPi - Home Domotica
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ============================================
// INVIA EMAIL VERIFICA
// ============================================
export const sendVerificationEmail = async (
  email: string,
  nome: string,
  token: string
): Promise<boolean> => {
  const verificationLink = `${FRONTEND_URL}/verify-email?token=${token}`;

  try {
    await transporter.sendMail({
      from: `"OmniaPi Home" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '✓ Verifica il tuo account OmniaPi',
      html: getVerificationEmailHTML(nome, verificationLink),
    });

    console.log(`📧 Email verifica inviata a: ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Errore invio email verifica a ${email}:`, error);
    return false;
  }
};

// ============================================
// INVIA EMAIL RESET PASSWORD
// ============================================
export const sendResetPasswordEmail = async (
  email: string,
  nome: string,
  token: string
): Promise<boolean> => {
  const resetLink = `${FRONTEND_URL}/reset-password?token=${token}`;

  try {
    await transporter.sendMail({
      from: `"OmniaPi Home" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '🔐 Reset Password - OmniaPi',
      html: getResetPasswordEmailHTML(nome, resetLink),
    });

    console.log(`📧 Email reset password inviata a: ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Errore invio email reset a ${email}:`, error);
    return false;
  }
};

export default {
  generateToken,
  verifyEmailConfig,
  sendVerificationEmail,
  sendResetPasswordEmail,
};
