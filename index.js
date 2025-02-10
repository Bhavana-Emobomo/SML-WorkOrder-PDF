const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDBClient = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

exports.handler = async (event) => {
  try {
    const {
      GatePass,
      VendorName,
      CustomerName,
      ReturnStatus,
      listItems,
      Issued_Date,
      Received_Date,
      Comments,
    } = JSON.parse(event.body);

    console.log(JSON.parse(event.body));
    let base64ModifiedPdf;

    function convertToDDMMYYYY(dateString) {
      if (!dateString) return null; // Return null if the input is empty or undefined

      // Check if the format is yyyy-mm-dd
      const datePattern = /^\d{4}-\d{2}-\d{2}$/; // Regex to match yyyy-mm-dd
      if (datePattern.test(dateString)) {
        const [year, month, day] = dateString.split("-"); // Split by hyphen
        return `${day}/${month}/${year}`; // Rearrange to dd/mm/yyyy
      }

      // If the input is not in yyyy-mm-dd format, return it as is
      return dateString;
    }

    const formattedIssued_Date = Issued_Date
      ? convertToDDMMYYYY(Issued_Date)
      : "";
    const formattedReceived_Date = Received_Date
      ? convertToDDMMYYYY(Received_Date)
      : "";

    let isNextPageNeeded = false;
    let isNextPageNeededFooter = false;
    let currentPageNumber = 1;

    function splitText(text, maxWidth, fontSize, font) {
      let lines = [];
      let currentLine = "";

      for (let i = 0; i < text.length; i++) {
        const testLine = currentLine + text[i]; // Add one character at a time
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth <= maxWidth) {
          currentLine = testLine; // Keep adding characters if within width
        } else {
          lines.push(currentLine); // Push the current line and start a new one
          currentLine = text[i]; // Start the new line with the current character
        }
      }

      if (currentLine) {
        lines.push(currentLine); // Add the last line
      }

      return lines;
    }

    if (VendorName) {
      console.log("Generating PDF for Vendor:", VendorName);

      const params = {
        TableName: "Vendor",
        FilterExpression: "#name = :VendorName",
        ExpressionAttributeNames: { "#name": "Name" },
        ExpressionAttributeValues: { ":VendorName": VendorName },
      };

      const data = await docClient.send(new ScanCommand(params));
      const vendorData = data.Items && data.Items[0];
      if (!vendorData) {
        throw new Error("Vendor data not found");
      }

      const {
        PhoneNumber: VendorPhNo,
        Address: VendorAddress,
        CompanyEmail: VendorEmail,
      } = vendorData.Values;

      console.log(vendorData);

      const base64FilePath = path.join(__dirname, "pdfBase64.txt");
      const base64ExistingPdf = fs.readFileSync(base64FilePath, "utf8");
      const existingPdfBytes = Uint8Array.from(
        Buffer.from(base64ExistingPdf, "base64")
      );

      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesRomanFontBold = await pdfDoc.embedFont(
        StandardFonts.TimesRomanBold
      );
      const blackColor = rgb(0, 0, 0);

      const footerSpace = 80;
      const pages = pdfDoc.getPages();
      let currentPage = pages[0];
      let itemY = 620;

      currentPage.drawText(ReturnStatus, {
        x: 250,
        y: 750,
        size: 12,
        font: timesRomanFontBold,
        color: blackColor,
      });

      currentPage.drawText(GatePass, {
        x: 82,
        y: 716,
        size: 9,
        font: timesRomanFontBold,
        color: blackColor,
      });
      currentPage.drawText(formattedIssued_Date, {
        x: 305,
        y: 716,
        size: 9,
        font: timesRomanFontBold,
        color: blackColor,
      });
      currentPage.drawText(formattedReceived_Date, {
        x: 485,
        y: 716,
        size: 9,
        font: timesRomanFontBold,
        color: blackColor,
      });
      currentPage.drawText(VendorName, {
        x: 310,
        y: 690,
        size: 7,
        font: timesRomanFontBold,
        color: blackColor,
      });

      const maxWidth = 225; // Adjust width as needed
      const fontSize = 7;
      const textLines = splitText(
        VendorAddress,
        maxWidth,
        fontSize,
        timesRomanFont
      );

      let yPosition = 680;
      for (const line of textLines) {
        currentPage.drawText(line, {
          x: 310,
          y: yPosition,
          size: fontSize,
          font: timesRomanFont,
          color: blackColor,
        });
        yPosition -= 8; // Adjust line spacing as needed
      }

      // Table headers

      const tableHeaders = [
        "SNO",
        "Description",
        "Item Code",
        "Quantity",
        "WorkOrderId",
      ];
      const tableXPositions = [25, 60, 280, 430, 480];
      const maxWidthForColumns = [30, 80, 140, 180, 100];
      
      const rowHeight = 25;
      const cellPadding = 2;
      const minRowHeight = 18; // Slightly increased for better text alignment
      const lineHeight = 20;
      const headerMoveOffset = -5;
      // Move horizontal lines and text slightly up
      const moveUpAmount = 3; // Fine-tuned for best alignment
      
      // Draw table headers
      tableHeaders.forEach((header, index) => {
        currentPage.drawText(header, {
          x: tableXPositions[index] + cellPadding,
          y: itemY - rowHeight / 2 + headerMoveOffset, // Move header up/down
          size: 9,
          font: timesRomanFontBold,
          color: blackColor,
        });
      });
      
      // Adjusted header line positions
      const headerBottomY = itemY - rowHeight;
      currentPage.drawLine({
        start: { x: tableXPositions[0], y: itemY },
        end: { x: tableXPositions[tableXPositions.length - 1] + 100, y: itemY },
        thickness: 1,
        color: blackColor,
      });
      currentPage.drawLine({
        start: { x: tableXPositions[0], y: headerBottomY },
        end: {
          x: tableXPositions[tableXPositions.length - 1] + 100,
          y: headerBottomY,
        },
        thickness: 1,
        color: blackColor,
      });
      
      // Adjusted vertical line positions
      tableXPositions.forEach((xPos) => {
        currentPage.drawLine({
          start: { x: xPos, y: itemY },
          end: { x: xPos, y: headerBottomY },
          thickness: 1,
          color: blackColor,
        });
      });
      
      // Right border for header
      currentPage.drawLine({
        start: {
          x: tableXPositions[tableXPositions.length - 1] + 100,
          y: itemY,
        },
        end: {
          x: tableXPositions[tableXPositions.length - 1] + 100,
          y: headerBottomY,
        },
        thickness: 1,
        color: blackColor,
      });
      
      // Move to first row
      itemY = headerBottomY;
      
      // Draw table rows
      listItems.forEach((item) => {
        if (itemY < footerSpace) {
          currentPage.drawText(`Continuation of Page ${currentPageNumber}`, {
            x: 400,
            y: itemY,
            size: 12,
            font: timesRomanFontBold,
            color: blackColor,
          });
      
          itemY -= 20;
          currentPage = pdfDoc.addPage();
          currentPageNumber++;
          itemY = 740;
        }
      
        const rowTopY = itemY;
      
        // Split text for wrapping
        const descriptionLines = splitText(
          item.Description,
          maxWidthForColumns[1] * 2.2, // Increase width by 10%
          9,
          timesRomanFont
        );
        const ItemCodeLines = splitText(
          item.ItemCode,
          maxWidthForColumns[2],
          9,
          timesRomanFont
        );
        const WorkOrderLines = splitText(
          item.WorkOrderId,
          maxWidthForColumns[4],
          9,
          timesRomanFont
        );
      
        // Calculate max lines per row
        const maxLinesInRow = Math.max(
          descriptionLines.length,
          ItemCodeLines.length,
          WorkOrderLines.length,
          1
        );
      
        // Dynamically calculate row height based on the longest column text
        const extraSpacing = (maxLinesInRow - 1) * 9; // 6px extra per additional line
        const dynamicRowHeight = Math.max(minRowHeight, maxLinesInRow * lineHeight + extraSpacing);
        const rowBottomY = rowTopY - dynamicRowHeight;
      
        // Adjusted text position for centering within the row
        const textStartY = rowTopY - (dynamicRowHeight / 2) + (lineHeight / 2) - 7;
      
        // Draw text for each column (Perfectly centered)
        currentPage.drawText(item.SNO, {
          x: tableXPositions[0] + cellPadding,
          y: textStartY,
          size: 9,
          font: timesRomanFont,
          color: blackColor,
        });
      
        // Adjust Description Column Y-Position
        descriptionLines.forEach((line, index) => {
          // Adjust the Y-position to ensure no extra space at the top
          currentPage.drawText(line, {
            x: tableXPositions[1] + cellPadding,
            y: textStartY - index * lineHeight - moveUpAmount,  // Apply moveUpAmount here to reduce top space
            size: 9,
            font: timesRomanFont,
            color: blackColor,
          });
        });
      
        ItemCodeLines.forEach((line, index) => {
          currentPage.drawText(line, {
            x: tableXPositions[2] + cellPadding,
            y: textStartY - index * lineHeight,
            size: 9,
            font: timesRomanFont,
            color: blackColor,
          });
        });
      
        currentPage.drawText(item.Quantity, {
          x: tableXPositions[3] + cellPadding,
          y: textStartY,
          size: 9,
          font: timesRomanFont,
          color: blackColor,
        });
      
        WorkOrderLines.forEach((line, index) => {
          currentPage.drawText(line, {
            x: tableXPositions[4] + cellPadding,
            y: textStartY - index * lineHeight,
            size: 9,
            font: timesRomanFont,
            color: blackColor,
          });
        });
      
        // Draw horizontal line below the row
        currentPage.drawLine({
          start: { x: tableXPositions[0], y: rowBottomY },
          end: {
            x: tableXPositions[tableXPositions.length - 1] + 100,
            y: rowBottomY,
          },
          thickness: 1,
          color: blackColor,
        });
      
        // Fix vertical lines to align properly
        tableXPositions.forEach((xPos) => {
          currentPage.drawLine({
            start: { x: xPos, y: rowTopY },
            end: { x: xPos, y: rowBottomY },
            thickness: 1,
            color: blackColor,
          });
        });
      
        // Right border for each row
        currentPage.drawLine({
          start: {
            x: tableXPositions[tableXPositions.length - 1] + 100,
            y: rowTopY,
          },
          end: {
            x: tableXPositions[tableXPositions.length - 1] + 100,
            y: rowBottomY,
          },
          thickness: 1,
          color: blackColor,
        });
      
        itemY = rowBottomY; // Move to the next row
      });
      
      itemY -= 20;


      // Signature section
      if (itemY - 60 < footerSpace) {
        if (!isNextPageNeededFooter) {
          currentPage.drawText(`Continuation of Page ${currentPageNumber} `, {
            x: 400, // Adjust X position for centering
            y: itemY, // Position it above the footer area
            size: 12,
            font: timesRomanFontBold,
            color: blackColor,
          });

          itemY -= 20; // Adjust Y position after placing the message
        }
        currentPage = pages[1] || pdfDoc.addPage();
        isNextPageNeededFooter = true;
        currentPageNumber++;
        itemY = 740;
      }

      const maxWidthComments = 900; // Adjust width as needed
      console.log(Comments);
      const isComments = Comments ? true : false; // True if comments exist

      let textLinesComments = [];
      console.log(isComments);
      if (isComments) {
        textLinesComments = splitText(
          Comments,
          maxWidthComments,
          14,
          timesRomanFont
        );
      } else {
        textLinesComments = [""]; // Default to empty if no comments
      }

      if (isComments) {
        currentPage.drawText("Note:", {
          x: 50,
          y: itemY + 10,
          size: 14,
          font: timesRomanFontBold,
          color: blackColor,
        });
      }

      for (const line of textLinesComments) {
        currentPage.drawText(line, {
          x: 85,
          y: itemY + 10,
          size: 12,
          font: timesRomanFont,
          color: blackColor,
        });
        itemY -= 8;
      }

      //  currentPage.drawText(`${Comments}`, {
      //   x: 85,
      //   y: itemY - 10,
      //   size: 12,
      //   font: timesRomanFont,
      //   color: blackColor,
      // });

      currentPage.drawText("For Sri Mahalakshmi Engineering Works,", {
        x: 50,
        y: itemY - 20,
        size: 12,
        font: timesRomanFontBold,
        color: blackColor,
      });
      currentPage.drawText("Authorized Signature", {
        x: 50,
        y: itemY - 35,
        size: 12,
        font: timesRomanFont,
        color: blackColor,
      });

      currentPage.drawText("Receiver Name and Signature ,", {
        x: 350,
        y: itemY - 20,
        size: 12,
        font: timesRomanFontBold,
        color: blackColor,
      });

      currentPage.drawText("Checked By,", {
        x: 50,
        y: itemY - 80,
        size: 14,
        font: timesRomanFontBold,
        color: blackColor,
      });

      currentPage.drawText("Note: This is Auto computer generated gatepass", {
        x: 50,
        y: itemY - 110,
        size: 8,
        font: timesRomanFont,
        color: blackColor,
      });

      // Finalize the document
      const modifiedPdfBytes = await pdfDoc.save();
      const base64ModifiedPdf =
        Buffer.from(modifiedPdfBytes).toString("base64");
      return {
        statusCode: 200,
        body: base64ModifiedPdf,
      };
    } else {
      console.log("Generating PDF for Customer:", CustomerName);

      const params = {
        TableName: "Vendor", // Replace with your table name
        FilterExpression: "#name = :CustomerName",
        ExpressionAttributeNames: { "#name": "Name" },
        ExpressionAttributeValues: { ":CustomerName": CustomerName },
      };

      const data = await docClient.send(new ScanCommand(params));
      const CustomerData = data.Items && data.Items[0];
      if (!CustomerData) {
        throw new Error("Vendor data not found");
      }

      const {
        PhoneNumber: VendorPhNo,
        Address: VendorAddress,
        CustomerEmail: VendorEmail,
      } = CustomerData.Values;

      console.log(CustomerData);

      const base64FilePath = path.join(__dirname, "pdfBase64.txt");
      const base64ExistingPdf = fs.readFileSync(base64FilePath, "utf8");
      const existingPdfBytes = Uint8Array.from(
        Buffer.from(base64ExistingPdf, "base64")
      );

      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const timesRomanFontBold = await pdfDoc.embedFont(
        StandardFonts.TimesRomanBold
      );
      const blackColor = rgb(0, 0, 0);

      const footerSpace = 80;
      const pages = pdfDoc.getPages();
      let currentPage = pages[0];
      let itemY = 620;

      currentPage.drawText(ReturnStatus, {
        x: 250,
        y: 750,
        size: 12,
        font: timesRomanFontBold,
        color: blackColor,
      });

      currentPage.drawText(GatePass, {
        x: 82,
        y: 716,
        size: 9,
        font: timesRomanFontBold,
        color: blackColor,
      });
      currentPage.drawText(formattedIssued_Date, {
        x: 305,
        y: 716,
        size: 9,
        font: timesRomanFontBold,
        color: blackColor,
      });
      currentPage.drawText(formattedReceived_Date, {
        x: 485,
        y: 716,
        size: 9,
        font: timesRomanFontBold,
        color: blackColor,
      });
      currentPage.drawText(CustomerName, {
        x: 310,
        y: 690,
        size: 8,
        font: timesRomanFontBold,
        color: blackColor,
      });

      const maxWidth = 225; // Adjust width as needed
      const fontSize = 7;
      const textLines = splitText(
        VendorAddress,
        maxWidth,
        fontSize,
        timesRomanFont
      );

      let yPosition = 680;
      for (const line of textLines) {
        currentPage.drawText(line, {
          x: 310,
          y: yPosition,
          size: fontSize,
          font: timesRomanFontBold,
          color: blackColor,
        });
        yPosition -= 8; // Adjust line spacing as needed
      }

      // Table headers
      const tableHeaders = [
        "SNO",
        "Description",
        "Item Code",
        "Quantity",
        "WorkOrderId",
      ];
      
      const tableXPositions = [25, 60, 280, 430, 480];
      const maxWidthForColumns = [30, 430, 140, 180, 100]; // Adjusted max width for Description column
      
      const rowHeight = 25;  // Row height set to 25
      const cellPadding = 2;  // Padding set to 2
      const minRowHeight = 18; // Minimum row height
      const lineHeight = 10;  // Line height set to 10
      
      // let itemY = 740; // Example starting position for Y coordinate
      let currentPageNumber = 1;
      let isNextPageNeeded = false;
      
      // Draw table headers with padding and borders
      tableHeaders.forEach((header, index) => {
        currentPage.drawText(header, {
          x: tableXPositions[index] + cellPadding,
          y: itemY,
          size: 9,
          font: timesRomanFontBold,
          color: blackColor,
        });
      });
      
      // Draw horizontal line above header row (top border)
      currentPage.drawLine({
        start: { x: tableXPositions[0], y: itemY + rowHeight / 2 },
        end: {
          x: tableXPositions[tableXPositions.length - 1] + 100,
          y: itemY + rowHeight / 2,
        },
        thickness: 1,
        color: blackColor,
      });
      
      // Draw horizontal line below header row (bottom border)
      currentPage.drawLine({
        start: { x: tableXPositions[0], y: itemY - rowHeight / 2 },
        end: {
          x: tableXPositions[tableXPositions.length - 1] + 100,
          y: itemY - rowHeight / 2,
        },
        thickness: 1,
        color: blackColor,
      });
      
      // Draw vertical lines for header columns (excluding right line)
      tableXPositions.forEach((xPos) => {
        currentPage.drawLine({
          start: { x: xPos, y: itemY + rowHeight / 2 },
          end: { x: xPos, y: itemY - rowHeight / 2 },
          thickness: 1,
          color: blackColor,
        });
      });
      
      // Draw right vertical line after the header
      currentPage.drawLine({
        start: {
          x: tableXPositions[tableXPositions.length - 1] + 100,
          y: itemY + rowHeight / 2,
        },
        end: {
          x: tableXPositions[tableXPositions.length - 1] + 100,
          y: itemY - rowHeight / 2,
        },
        thickness: 1,
        color: blackColor,
      });
      
      // Draw rows with padding and borders
      itemY -= rowHeight;
      listItems.forEach((item) => {
        if (itemY < footerSpace) {
          currentPage.drawText(`Continuation of Page ${currentPageNumber}`, {
            x: 400, // Adjust X position for centering
            y: itemY, // Position it at the top of the new page
            size: 12,
            font: timesRomanFontBold,
            color: blackColor,
          });
      
          itemY -= 20; // Adjust Y to start content below the message
          // Add a new page when space is insufficient
          currentPage = pdfDoc.addPage();
          currentPageNumber++; // Increment page number
          itemY = 740; // Reset Y position for the new page
      
          // Set isNextPageNeeded to false after message is drawn
          isNextPageNeeded = false;
        }
      
        const rowTextY = itemY;
        const ItemCodeLines = splitText(item.ItemCode, 150, 9, timesRomanFont);
        const descriptionLines = splitText(item.Description, maxWidthForColumns[1], 9, timesRomanFont); // Full width for description
        const WorkOrderLines = splitText(item.WorkOrderId, 100, 9, timesRomanFont);
      
        const maxLinesInRow = Math.max(
          ItemCodeLines.length,
          WorkOrderLines.length,
          descriptionLines.length,
          1 // Ensure there's at least one line for each field
        );
      
        // Dynamic row height, considering line height and padding
        const dynamicRowHeight = Math.max(maxLinesInRow * lineHeight + 15, minRowHeight); // Ensure the row height doesn't go below minRowHeight
      
        // Draw each cell's content with padding
        currentPage.drawText(item.SNO, {
          x: tableXPositions[0] + cellPadding,
          y: rowTextY,
          size: 9,
          font: timesRomanFont,
          color: blackColor,
        });
      
        ItemCodeLines.forEach((line, index) => {
          currentPage.drawText(line, {
            x: tableXPositions[2] + cellPadding,
            y: rowTextY - index * lineHeight,
            size: 9,
            font: timesRomanFont,
            color: blackColor,
          });
        });
      
        WorkOrderLines.forEach((line, index) => {
          currentPage.drawText(line, {
            x: tableXPositions[4] + cellPadding,
            y: rowTextY - index * lineHeight,
            size: 9,
            font: timesRomanFont,
            color: blackColor,
          });
        });
      
        // Draw cell content for Description
        descriptionLines.forEach((line, index) => {
          currentPage.drawText(line, {
            x: tableXPositions[1] + cellPadding,
            y: rowTextY - index * lineHeight,
            size: 9,
            font: timesRomanFont,
            color: blackColor,
          });
        });
      
        currentPage.drawText(item.Quantity, {
          x: tableXPositions[3] + cellPadding,
          y: rowTextY,
          size: 9,
          font: timesRomanFont,
          color: blackColor,
        });
      
        // Draw horizontal line below each row
        currentPage.drawLine({
          start: { x: tableXPositions[0], y: rowTextY - dynamicRowHeight / 2 },
          end: {
            x: tableXPositions[tableXPositions.length - 1] + 100,
            y: rowTextY - dynamicRowHeight / 2,
          },
          thickness: 1,
          color: blackColor,
        });
      
        // Draw vertical lines for each row cell, including right border
        tableXPositions.forEach((xPos) => {
          currentPage.drawLine({
            start: { x: xPos, y: rowTextY + dynamicRowHeight - 12 },
            end: { x: xPos, y: rowTextY - dynamicRowHeight + 12 },
            thickness: 1,
            color: blackColor,
          });
        });
        currentPage.drawLine({
          start: {
            x: tableXPositions[tableXPositions.length - 1] + 100,
            y: rowTextY + dynamicRowHeight - 12,
          },
          end: {
            x: tableXPositions[tableXPositions.length - 1] + 100,
            y: rowTextY - dynamicRowHeight + 12,
          },
          thickness: 1,
          color: blackColor,
        });
      
        itemY -= dynamicRowHeight;
      });
      
      itemY -= 20; // Space after rows before next content
      

      // Signature section
      if (itemY - 60 < footerSpace) {
        if (!isNextPageNeededFooter) {
          currentPage.drawText(`Continuation of Page ${currentPageNumber} `, {
            x: 400, // Adjust X position for centering
            y: itemY, // Position it above the footer area
            size: 12,
            font: timesRomanFontBold,
            color: blackColor,
          });

          itemY -= 20; // Adjust Y position after placing the message
        }
        currentPage = pages[1] || pdfDoc.addPage();
        isNextPageNeededFooter = true;
        currentPageNumber++;
        itemY = 740;
      }

      const maxWidthComments = 900; // Adjust width as needed
      console.log(Comments);
      const isComments = Comments ? true : false; // True if comments exist

      let textLinesComments = [];
      console.log(isComments);
      if (isComments) {
        textLinesComments = splitText(
          Comments,
          maxWidthComments,
          14,
          timesRomanFont
        );
      } else {
        textLinesComments = [""]; // Default to empty if no comments
      }
      if (isComments) {
        currentPage.drawText("Note:", {
          x: 50,
          y: itemY + 10,
          size: 14,
          font: timesRomanFontBold,
          color: blackColor,
        });
      }

      console.log(textLinesComments);
      for (const line of textLinesComments) {
        currentPage.drawText(line, {
          x: 85,
          y: itemY + 10,
          size: 12,
          font: timesRomanFont,
          color: blackColor,
        });
        itemY -= 8;
      }

      currentPage.drawText("For Sri Mahalakshmi Engineering Works,", {
        x: 50,
        y: itemY - 20,
        size: 12,
        font: timesRomanFontBold,
        color: blackColor,
      });
      currentPage.drawText("Authorized Signature", {
        x: 50,
        y: itemY - 35,
        size: 12,
        font: timesRomanFont,
        color: blackColor,
      });

      currentPage.drawText("Receiver Name and Signature ,", {
        x: 350,
        y: itemY - 20,
        size: 12,
        font: timesRomanFontBold,
        color: blackColor,
      });

      currentPage.drawText("Checked By,", {
        x: 50,
        y: itemY - 80,
        size: 12,
        font: timesRomanFontBold,
        color: blackColor,
      });

      currentPage.drawText("Note: This is Auto computer generated gatepass", {
        x: 50,
        y: itemY - 110,
        size: 8,
        font: timesRomanFont,
        color: blackColor,
      });

      // Finalize the document
      const modifiedPdfBytes = await pdfDoc.save();
      const base64ModifiedPdf =
        Buffer.from(modifiedPdfBytes).toString("base64");
      return {
        statusCode: 200,
        body: base64ModifiedPdf,
      };
    }
  } catch (error) {
    console.error("Error modifying PDF:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Failed to modify PDF",
        error: error.message,
      }),
    };
  }
};

// const fs = require("fs");
// const { PDFDocument } = require("pdf-lib");

async function base64ToPDF(inputFile, outputFile) {
  try {
    // Read the Base64 string from the file
    const base64String = fs.readFileSync(inputFile, "utf-8").trim();

    // Remove metadata if present (like 'data:application/pdf;base64,')
    const base64Data = base64String.replace(
      /^data:application\/pdf;base64,/,
      ""
    );

    // Convert Base64 string to a Uint8Array (binary data)
    const pdfBytes = Buffer.from(base64Data, "base64");

    // Load PDF document from the decoded bytes
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Save the PDF document
    const savedPdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputFile, savedPdfBytes);

    console.log(`✅ PDF successfully created: ${outputFile}`);
  } catch (error) {
    console.error("❌ Error converting Base64 to PDF:", error.message);
  }
}

// // Example Usage
base64ToPDF("pdfBase64.txt", "output.pdf");
