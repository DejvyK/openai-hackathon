# Google Calendar through CopilotKit

The extension uses the existing CopilotKit sidebar and AG-UI runtime. Its agent calls the project-scoped `google_calendar_create_event` MCP tool. The API server owns Google OAuth and Calendar requests. No Google credentials are sent to the model or extension.

New pages offer contextual suggestions without executing actions. Accepting an action or submitting a task captures the page again. Calendar creation uses the connected account's primary calendar, requires an explicit start/end and time zone, and returns an actual event link after provider read-back. It does not invite attendees.

## Connect the account

1. In [Google Cloud Console](https://console.cloud.google.com/), choose the application's project and enable Google Calendar API.
2. Configure Google Auth Platform branding/audience. For an external app in testing, add the Google account that will connect as a test user.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI: `http://127.0.0.1:4318/oauth/google-calendar/callback`.
4. Put `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` into the ignored `apps/api/.env` file. Keep `AGENTLAYER_MODE=live`. These are Google OAuth credentials, separate from the CopilotKit project key.
5. Start/restart the API from `apps/api` so it loads that `.env`. Reload the built extension when its files change.
6. In extension settings, choose **Connect Google Calendar**, complete Google's account consent, then refresh the connection status.

The requested scope is `https://www.googleapis.com/auth/calendar.events.owned`. OAuth credentials and refresh tokens stay in the API's ignored local storage. Disconnect removes the local connection. OAuth testing-mode expiration and consent restrictions are governed by the Google project configuration.

## Evidence boundary

Configuration, compilation and fixture checks do not establish a connected Google account or a live created event. Account consent is required before live calendar access. No external event should be created merely to test this integration without an explicitly authorized event.

References: [CopilotKit agent protocols](https://docs.copilotkit.ai/ag2/agentic-protocols), [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).
