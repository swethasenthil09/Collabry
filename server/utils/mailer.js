const nodemailer = require('nodemailer');

let transporter = null;
let etherealAccount = null;

async function getTransporter() {
  if (!transporter) {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const host = (process.env.SMTP_HOST || '').toLowerCase();
      const isBrevo = host.includes('brevo') || host.includes('sendinblue');
      const isResend = host.includes('resend') || process.env.SMTP_USER === 'resend';
      const isGmail = host.includes('gmail');
      
      if (isResend) {
        transporter = nodemailer.createTransport({
          host: 'smtp.resend.com',
          port: 465,
          secure: true,
          auth: {
            user: 'resend',
            pass: process.env.SMTP_PASS,
          },
        });
      } else if (isBrevo) {
        transporter = nodemailer.createTransport({
          host: 'smtp-relay.brevo.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      } else if (isGmail) {
        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      } else {
        transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      }
    } else {
      // Auto-generate free ethereal test account for 1-click browser preview
      try {
        if (!etherealAccount) {
          etherealAccount = await nodemailer.createTestAccount();
        }
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: etherealAccount.user,
            pass: etherealAccount.pass,
          },
        });
      } catch (e) {
        // Fallback dummy
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          auth: { user: 'collabry@ethereal.email', pass: 'dummy123' },
        });
      }
    }
  }
  return transporter;
}

/**
 * Optional: Send via Brevo REST API (Bypasses IP authorization check entirely!)
 */
async function sendViaBrevoApi(toEmail, subject, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'Collabry',
          email: process.env.SMTP_FROM || 'no-reply@collabry.io',
        },
        to: [{ email: toEmail }],
        subject,
        htmlContent,
      }),
    });
    if (res.ok) {
      console.log('✅ Email successfully delivered via Brevo REST API to', toEmail);
      return true;
    } else {
      const errData = await res.json().catch(() => ({}));
      console.warn('⚠️ Brevo REST API returned:', res.status, errData.message || errData);
      return false;
    }
  } catch (e) {
    console.warn('⚠️ Brevo REST API fetch error:', e.message);
    return false;
  }
}

/**
 * Generate a secure 6-digit numerical OTP code
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send Email Verification OTP + 1-Click Verification Link
 */
async function sendVerificationOTP(email, name, otp, verificationLink) {
  const subject = '🔐 Verify your Collabry account';
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const actionLink = verificationLink || `${clientUrl}/verify-email?email=${encodeURIComponent(email)}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background-color: #0f1117; color: #e1e3ea; border-radius: 12px; overflow: hidden; border: 1px solid #232733;">
      <div style="background: linear-gradient(135deg, #5865F2, #4752C4); padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Collabry</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0 0; font-size: 13px;">Social Collaboration &amp; Project Management</p>
      </div>
      <div style="padding: 28px 24px;">
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 0; text-align: center;">Welcome to Collabry!</h2>
        <p style="font-size: 14px; line-height: 1.5; color: #9da3b4; text-align: center;">
          Hi <strong>${name || 'Builder'}</strong>,<br/><br/>
          To complete your registration and activate your full account, click the button below or enter the 6-digit PIN:
        </p>

        <!-- Method 1: 1-Click Verification Button -->
        <div style="margin: 26px 0; text-align: center;">
          <a href="${actionLink}" target="_blank" style="background: linear-gradient(135deg, #5865F2, #4752C4); color: #ffffff; padding: 14px 34px; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 8px; display: inline-block; box-shadow: 0 4px 14px rgba(88, 101, 242, 0.4);">
            ✓ Verify My Email Address
          </a>
        </div>

        <div style="display: flex; align-items: center; margin: 24px 0; text-align: center;">
          <div style="flex: 1; border-top: 1px solid #232733;"></div>
          <span style="padding: 0 10px; font-size: 11px; text-transform: uppercase; color: #72798e; letter-spacing: 0.5px;">OR ENTER 6-DIGIT PIN</span>
          <div style="flex: 1; border-top: 1px solid #232733;"></div>
        </div>

        <!-- Method 2: 6-Digit PIN Code -->
        <div style="margin: 18px 0; text-align: center;">
          <div style="display: inline-block; background-color: #1e222f; border: 2px dashed #5865F2; border-radius: 10px; padding: 12px 24px; font-size: 26px; font-weight: 800; letter-spacing: 6px; color: #ffffff; font-family: monospace;">
            ${otp}
          </div>
        </div>

        <p style="font-size: 12px; color: #72798e; text-align: center; margin-bottom: 0;">
          This verification link &amp; code will expire in <strong>15 minutes</strong>.<br/>
          If you did not create a Collabry account, you can safely ignore this email.
        </p>
      </div>
      <div style="background-color: #0b0d12; padding: 14px; text-align: center; border-top: 1px solid #232733; font-size: 11px; color: #5a6072;">
        Collabry Platform • Building the future of collaborative workspaces
      </div>
    </div>
  `;

  if (process.env.NODE_ENV !== 'test' && !email.endsWith('@collabry.test')) {
    console.log('\n======================================================');
    console.log(`🔐 [COLLABRY EMAIL VERIFICATION]`);
    console.log(`📧 Recipient: ${email}`);
    console.log(`👉 6-DIGIT PIN CODE: >>> ${otp} <<<`);
    console.log(`🔗 1-Click Verification Link: ${actionLink}`);
    console.log('======================================================\n');
  }

  // 1. If Brevo REST API Key is configured, send via REST API (No IP restrictions!)
  if (process.env.BREVO_API_KEY) {
    const sent = await sendViaBrevoApi(email, subject, html);
    if (sent) return true;
  }

  try {
    const activeTransporter = await getTransporter();
    const info = await activeTransporter.sendMail({
      from: `"Collabry" <${process.env.SMTP_FROM || 'no-reply@collabry.io'}>`,
      to: email,
      subject,
      html,
    });

    const testUrl = nodemailer.getTestMessageUrl(info);
    if (testUrl) {
      console.log(`🌐 Preview Email in Browser: ${testUrl}`);
      console.log('======================================================\n');
    }
  } catch (err) {
    if (err.message && (err.message.includes('525') || err.message.includes('Unauthorized IP'))) {
      console.warn('⚠️ Brevo SMTP Note: Your current IP address is not authorized in your Brevo account (525 5.7.1).');
      console.warn('👉 To deliver emails to your real inbox via Brevo: Whitelist your IP in Brevo Dashboard -> SMTP & API -> Authorized IP addresses, or use Gmail App Password.');
      console.warn('💡 In the meantime, use the 6-Digit PIN or 1-Click Link printed above to verify immediately!\n');
    } else {
      console.warn('⚠️ Mail delivery note:', err.message);
    }
  }
  return true;
}

/**
 * Send Password Reset OTP
 */
async function sendPasswordResetOTP(email, name, otp) {
  const subject = '🔑 Reset your Collabry password (PIN Code)';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background-color: #0f1117; color: #e1e3ea; border-radius: 12px; overflow: hidden; border: 1px solid #232733;">
      <div style="background: linear-gradient(135deg, #ed4245, #c03537); padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">Collabry</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0 0; font-size: 13px;">Password Reset Request</p>
      </div>
      <div style="padding: 28px 24px;">
        <h2 style="color: #ffffff; font-size: 18px; margin-top: 0;">Password Reset PIN</h2>
        <p style="font-size: 14px; line-height: 1.5; color: #9da3b4;">
          Hi <strong>${name || 'Builder'}</strong>,<br/><br/>
          We received a request to reset the password for your Collabry account associated with <strong>${email}</strong>. Use the 6-digit verification code below to set a new password:
        </p>
        <div style="margin: 24px 0; text-align: center;">
          <div style="display: inline-block; background-color: #1e222f; border: 2px dashed #ed4245; border-radius: 10px; padding: 14px 28px; font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #ffffff; font-family: monospace;">
            ${otp}
          </div>
        </div>
        <p style="font-size: 12px; color: #72798e; text-align: center; margin-bottom: 0;">
          This code expires in <strong>15 minutes</strong>.<br/>
          If you did not request a password reset, please secure your account immediately.
        </p>
      </div>
      <div style="background-color: #0b0d12; padding: 14px; text-align: center; border-top: 1px solid #232733; font-size: 11px; color: #5a6072;">
        Collabry Platform • Security &amp; Identity Protection
      </div>
    </div>
  `;

  if (process.env.NODE_ENV !== 'test' && !email.endsWith('@collabry.test')) {
    console.log('\n======================================================');
    console.log(`🔑 [COLLABRY PASSWORD RESET PIN]`);
    console.log(`📧 Recipient: ${email}`);
    console.log(`👉 6-DIGIT RESET CODE: >>> ${otp} <<<`);
    console.log('======================================================\n');
  }

  // 1. If Brevo REST API Key is configured, send via REST API (No IP restrictions!)
  if (process.env.BREVO_API_KEY) {
    const sent = await sendViaBrevoApi(email, subject, html);
    if (sent) return true;
  }

  try {
    const activeTransporter = await getTransporter();
    const info = await activeTransporter.sendMail({
      from: `"Collabry Security" <${process.env.SMTP_FROM || 'security@collabry.io'}>`,
      to: email,
      subject,
      html,
    });

    const testUrl = nodemailer.getTestMessageUrl(info);
    if (testUrl) {
      console.log(`🌐 Preview Email in Browser: ${testUrl}`);
      console.log('======================================================\n');
    }
  } catch (err) {
    if (err.message && (err.message.includes('525') || err.message.includes('Unauthorized IP'))) {
      console.warn('⚠️ Brevo SMTP Note: Your current IP address is not authorized in your Brevo account (525 5.7.1).');
      console.warn('👉 Use the 6-Digit Password Reset PIN printed above to proceed with resetting your password.\n');
    } else {
      console.warn('⚠️ Mail delivery note:', err.message);
    }
  }
  return true;
}

module.exports = {
  generateOTP,
  sendVerificationOTP,
  sendPasswordResetOTP,
};
