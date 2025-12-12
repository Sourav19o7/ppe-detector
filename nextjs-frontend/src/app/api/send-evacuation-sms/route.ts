import { NextResponse } from 'next/server';

export async function POST() {
  const twilioAccountSid = 'ACdf6344c2ac12e7fdf126d24d2bd1603f';
  const twilioAuthToken = 'b1995fb247976cc4abfd1e67f635ba55';
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;

  try {
    const smsBody = new URLSearchParams();
    smsBody.append('To', '+918828642788');
    smsBody.append('MessagingServiceSid', 'MG4974bac9f9f83e04e5bc753397757974');
    smsBody.append('Body', 'METHANE GAS DETECTED! SAFTEY EVACUATION NEEDED');

    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: smsBody.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Twilio API error:', data);
      return NextResponse.json({ success: false, error: data }, { status: response.status });
    }

    console.log('SMS sent successfully:', data.sid);
    return NextResponse.json({ success: true, messageSid: data.sid });
  } catch (error) {
    console.error('Failed to send SMS:', error);
    return NextResponse.json({ success: false, error: 'Failed to send SMS' }, { status: 500 });
  }
}
