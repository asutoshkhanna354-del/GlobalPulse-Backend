export function buildOtpEmailHtml(otp: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GlobalPulse OTP Verification</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f7f7f7;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro", "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background-color: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      overflow: hidden;
      border: 1px solid #ebebeb;
    }
    .header {
      padding: 30px 40px;
      border-bottom: 1px solid #f0f0ee;
      text-align: left;
    }
    .header h1 {
      margin: 0;
      color: #434343;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 40px 40px;
      text-align: center;
    }
    .title {
      color: #5b5959;
      font-size: 22px;
      font-weight: 600;
      margin: 0 0 16px;
      text-transform: uppercase;
      letter-spacing: -0.3px;
    }
    .subtitle {
      color: #666666;
      font-size: 16px;
      line-height: 1.5;
      margin: 0 0 30px;
    }
    .otp-container {
      margin: 30px 0;
      padding: 20px;
      background-color: #fafaf9;
      border-radius: 8px;
      border: 1px solid #f0f0ee;
    }
    .otp-code {
      font-size: 42px;
      font-weight: 700;
      color: #353535;
      letter-spacing: 8px;
      margin: 0;
    }
    .expiration {
      color: #999999;
      font-size: 14px;
      font-weight: 500;
      margin-top: 25px;
    }
    .footer {
      padding: 30px;
      text-align: center;
      background-color: #ffffff;
      border-top: 1px solid #ebebeb;
    }
    .footer p {
      color: #999999;
      font-size: 13px;
      margin: 0 0 10px;
    }
    .footer a {
      color: #999999;
      text-decoration: none;
      margin: 0 5px;
    }
    .footer a:hover {
      text-decoration: underline;
    }
    @media only screen and (max-width: 600px) {
      .container { padding: 20px 10px; }
      .header { padding: 20px 25px; }
      .content { padding: 30px 25px; }
      .otp-code { font-size: 32px; letter-spacing: 6px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>GlobalPulse</h1>
      </div>
      <div class="content">
        <h2 class="title">Verify Your Sign-Up</h2>
        <p class="subtitle">Please use the verification code below to complete your sign-up process and secure your account.</p>
        
        <div class="otp-container">
          <p class="otp-code">${otp}</p>
        </div>
        
        <p class="expiration">Expires in 10 minutes</p>
      </div>
      <div class="footer">
        <p>You are receiving this because of a sign-up attempt on your account.</p>
        <p>
          <a href="#">Privacy Policy</a> &bull; <a href="#">Help Center</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
