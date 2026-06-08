import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import setLogs from "./logs";

// Columns that must never be silently overwritten once they hold a value.
// They may be SET (when currently empty) or CLEARED (written as ""), but an
// automatic update will never replace an existing non-empty value. This keeps
// closure/first-response timestamps stable across unrelated thread updates and
// protects manual edits made directly in the sheet.
export const WRITE_ONCE_COLUMNS = [
  "First Response",
  "Response time",
  "Closed at",
  "Closure Time",
];

export const testSheetsAccess = async () => {
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/spreadsheets",
    credentials: {
      client_email: process.env.GCP_CLIENT_EMAIL,
      private_key: process.env.GCP_PRIVATE_KEY?.split("\\n").join("\n"),
    },
  });

  const service = google.sheets({ version: "v4", auth });

  try {
    // Just try to get basic spreadsheet info
    const response = await service.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
    });
    console.log(
      "✅ Spreadsheet access successful:",
      response.data.properties?.title,
    );
    return true;
  } catch (error) {
    console.error("❌ Spreadsheet access failed:", error);
    return false;
  }
};

export const writeToSheets = async (values: any) => {
  const requestBody = {
    values,
  };

  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/spreadsheets",
    credentials: {
      client_email: process.env.GCP_CLIENT_EMAIL,
      private_key: process.env.GCP_PRIVATE_KEY?.split("\\n").join("\n"),
    },
  });

  const service = google.sheets({ version: "v4", auth });

  try {
    const result = await service.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      valueInputOption: "USER_ENTERED",
      requestBody,
      insertDataOption: "INSERT_ROWS",
      range: "Tickets!A1",
    });
    console.log("%d cells updated.", result.data.updates?.updatedCells);
    return result;
  } catch (err) {
    setLogs(err);
  }
};

export const updateSheets = async (
  id: string,
  values: any,
  writeValues: any,
) => {
  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/spreadsheets",
    credentials: {
      client_email: process.env.GCP_CLIENT_EMAIL,
      private_key: process.env.GCP_PRIVATE_KEY?.split("\\n").join("\n"),
    },
  });

  const service = google.sheets({ version: "v4", auth });
  try {
    // Step 1: Get the current sheet data to find the row index for the ID
    const sheetData = await service.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: "Tickets!A:Z",
    });

    const rows = sheetData.data.values || [];
    const header = rows[0];
    const idIndex = header.indexOf("thread_id");

    if (idIndex === -1) {
      setLogs({ message: "thread column not found", threadId: id });
      return;
    }

    // Find the row with the matching ID
    const rowIndex = rows.findIndex((row) => row[idIndex] === id);

    if (rowIndex === -1) {
      writeToSheets(writeValues);
      setLogs({
        message: "Row with the specified ID not found",
        threadId: id,
      });
      return;
    }

    const updatePromises = Object.entries(values).map(
      async ([column, newValue]) => {
        const columnIndex = header.indexOf(column);
        if (columnIndex === -1) {
          setLogs({
            message: "Column not found",
            threadId: id,
          });
          return;
        }

        // Write-once protection: never overwrite an already-set value in a
        // protected column. Setting (empty -> value) and clearing (value -> "")
        // are still allowed.
        const existingValue = rows[rowIndex]?.[columnIndex];
        if (
          WRITE_ONCE_COLUMNS.includes(column) &&
          existingValue !== undefined &&
          existingValue !== "" &&
          newValue !== undefined &&
          newValue !== ""
        ) {
          return;
        }

        const cellRange = `${String.fromCharCode(65 + columnIndex)}${
          rowIndex + 1
        }`;

        return service.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: cellRange,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[newValue]],
          },
        });
      },
    );

    const results = await Promise.all(updatePromises);
    console.log("%d cells updated.", results.length);
    return results;
  } catch (err) {
    setLogs({
      error: err,
      message: "Error updating sheet",
      threadId: id,
    });
  }
};
