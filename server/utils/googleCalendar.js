const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');

const getOAuthClient = () => {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/v1/auth/google/calendar-callback';

  if (!clientId || !clientSecret) {
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const getCalendarClient = () => {
  const oauth2Client = getOAuthClient();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!oauth2Client || !refreshToken) {
    return null;
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

/**
 * Creates a real Google Meet event on Google Calendar and returns the meet link
 */
const createGoogleMeetEvent = async ({ title, description, startTime, endTime }) => {
  try {
    const calendar = getCalendarClient();
    if (!calendar) {
      return null;
    }

    const event = {
      summary: title,
      description: description || 'Collabry Project Team Meeting',
      start: {
        dateTime: new Date(startTime).toISOString(),
      },
      end: {
        dateTime: new Date(endTime).toISOString(),
      },
      conferenceData: {
        createRequest: {
          requestId: uuidv4(),
          conferenceSolutionKey: {
            type: 'hangoutsMeet',
          },
        },
      },
    };

    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
    });

    const meetUrl = res.data.hangoutsLink ||
      res.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri;

    return meetUrl || null;
  } catch (err) {
    console.error('Google Calendar Meet Creation Error:', err.message);
    return null;
  }
};

module.exports = {
  getOAuthClient,
  getCalendarClient,
  createGoogleMeetEvent,
};
