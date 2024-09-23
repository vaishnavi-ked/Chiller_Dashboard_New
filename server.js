const express = require('express');
const xml2js = require('xml2js');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const https = require('https');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const EventEmitter = require('events');

const app = express();

app.use(cookieParser());
app.use(bodyParser.json());
app.use(express.static('public'));

const httpServer = http.createServer(app); // Create HTTP server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    transports: ['websocket', 'polling'],
    credentials: true
  },
  allowEIO3: true
});
const port = process.env.PORT || 3000;
const ejs = require('ejs');
app.engine('html', ejs.renderFile);
const eventEmitter = new EventEmitter();

const originConsoleLog = console.log;
console.log = function (data) {
  eventEmitter.emit('logging', data);
  originConsoleLog(data);
};

app.set("port", port);

// HTTPS Agent and Basic Authentication - Centralized
const agent = new https.Agent({
  rejectUnauthorized: false // Ignore self-signed certificate errors (use cautiously)
});

const auth = {
  username: 'vaishnavi',
  password: 'Ked@654321',
};

// Helper function for fetching data with authentication
const fetchWithAuth = async (url) => {
  try {
    const fetch = (await import('node-fetch')).default; // Dynamic import of node-fetch
    const response = await fetch(url, {
      agent: agent,
      headers: {
        Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.text(); // Fetch data as text (XML format)
    return data; // Return the fetched data
  } catch (error) {
    console.error("Error fetching data from URL:", url, error);
    throw error;
  }
};


const { JSDOM } = require('jsdom'); // Use jsdom to handle XML parsing

app.get('/fetch-data', async (req, res) => {
  try {
    const startDate = req.query.start || '2021-01-01T00:00:00.000+05:30';
    const endDate = req.query.end || '2021-12-31T00:00:00.999+05:30';

    const chillerUrls = [
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C1_FLA/~historyQuery?start=${startDate}&end=${endDate}`,
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C2_FLA/~historyQuery?start=${startDate}&end=${endDate}`,
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C3_FLA/~historyQuery?start=${startDate}&end=${endDate}`,
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C4_FLA/~historyQuery?start=${startDate}&end=${endDate}`,
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C5_FLA/~historyQuery?start=${startDate}&end=${endDate}`,
    ];

    const chillerData = await Promise.all(chillerUrls.map(async (url, index) => {
      console.log(`Fetching data for Chiller ${index + 1}...`);
      
      const xmlData = await fetchWithAuth(url); // Fetch data with authentication
      console.log(`Fetched XML for Chiller ${index + 1}:`, xmlData.substring(0, 200)); // Log XML snippet

      // Parse the XML using jsdom
      const dom = new JSDOM(xmlData, { contentType: "text/xml" });
      const document = dom.window.document;

      // Get the 'real' elements from the XML (FLA values)
      const realElements = document.getElementsByTagName('real');
      const abstimeElements = document.getElementsByTagName('abstime');

      console.log(`Number of 'real' elements for Chiller ${index + 1}: ${realElements.length}`);
      console.log(`Number of 'abstime' elements for Chiller ${index + 1}: ${abstimeElements.length}`);

      // Ensure data exists
      if (realElements.length === 0 || abstimeElements.length === 0) {
        console.log(`No data for Chiller ${index + 1}`);
        return []; // Return empty array if no data is found
      }

      // Extract the FLA values and timestamps
      const values = [];
      for (let i = 0; i < realElements.length; i++) {
        const timestamp = abstimeElements[i].getAttribute('val');
        const valueStr = realElements[i].getAttribute('val');
        const value = parseFloat(valueStr);
        
        if (isNaN(value)) {
          console.warn(`Invalid value found: ${valueStr} at ${timestamp}`);
        } else {
          values.push({ timestamp, value });
        }
      }

      console.log(`Extracted values for Chiller ${index + 1}:`, values);

      // Group by month and calculate averages
      const monthlyAverages = {};
      values.forEach(({ timestamp, value }) => {
        const date = new Date(timestamp);
        const month = date.getMonth(); // Month is 0-indexed (0 = January)
        
        if (!monthlyAverages[month]) {
          monthlyAverages[month] = { total: 0, count: 0 };
        }
        monthlyAverages[month].total += value;
        monthlyAverages[month].count++;
      });

      // Log monthly averages for debugging
      console.log(`Monthly averages for Chiller ${index + 1}:`, monthlyAverages);

      // Return monthly averages
      return Object.keys(monthlyAverages).map(month => ({
        month: parseInt(month, 10),
        average: monthlyAverages[month].total / monthlyAverages[month].count,
      }));
    }));

    // Format data for all chillers
    const formattedData = {};
    for (let month = 0; month < 12; month++) {
      formattedData[month] = formattedData[month] || {};
      for (let chillerIndex = 1; chillerIndex <= chillerUrls.length; chillerIndex++) {
        if (!formattedData[month][`chiller${chillerIndex}`]) {
          formattedData[month][`chiller${chillerIndex}`] = 0;
        }
      }
    }

    chillerData.forEach((data, index) => {
      data.forEach(({ month, average }) => {
        if (!formattedData[month]) {
          formattedData[month] = {};
        }
        formattedData[month][`chiller${index + 1}`] = average;
      });
    });

    console.log('Formatted Data:', formattedData);
    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching data:', error.message);
    res.status(500).send("Error fetching data");
  }
});
console.log("Received request for power started");
// Define the /power endpoint outside of /fetch-data
// Define the route to handle power data requests

// Function to calculate power
const calculatePower = (amps, volts) => amps * volts;

// Function to parse XML data and return values with timestamps
const parseXml = (xml) => {
  const dom = new JSDOM(xml, { contentType: "text/xml" });
  const document = dom.window.document;

  const timestamps = Array.from(document.getElementsByTagName('timestamp'));
  const realElements = Array.from(document.getElementsByTagName('real'));

  return { timestamps, realElements };
};

// Function to process data for each pump
const processPumpData = async (pumpType, pumpKey, urls) => {
  try {
    const [ampsXml, voltsXml] = await Promise.all([
      fetchWithAuth(urls.amps),
      fetchWithAuth(urls.volts)
    ]);

    // Parse the XML
    const { timestamps: ampsTimestamps, realElements: ampsReal } = parseXml(ampsXml);
    const { timestamps: voltsTimestamps, realElements: voltsReal } = parseXml(voltsXml);

    // Ensure the lengths match
    if (ampsReal.length !== voltsReal.length || ampsTimestamps.length !== voltsTimestamps.length) {
      throw new Error('Mismatched AMPS and VOLTS data lengths');
    }

    // Calculate total power for each timestamp
    let totalPower = 0;
    for (let i = 0; i < voltsReal.length; i++) {
      const timestamp = voltsTimestamps[i]?.getAttribute('val') || '';
      const voltsValue = parseFloat(voltsReal[i]?.getAttribute('val')) || 0;
      const ampsValue = parseFloat(ampsReal[i]?.getAttribute('val')) || 0;

      if (!isNaN(voltsValue) && !isNaN(ampsValue)) {
        const power = calculatePower(ampsValue, voltsValue);
        totalPower = totalPower + power/1000;
        //console.log("total power"+totalPower);
      } else {
        console.warn(`Invalid data at index ${i}: volts=${voltsValue}, amps=${ampsValue}`);
      }
    }

    return { pumpType, pump: pumpKey, power: totalPower };
  } catch (error) {
    console.error(`Error processing data for ${pumpType} pump ${pumpKey}:`, error);
    return { pumpType, pump: pumpKey, power: null };
  }
};
// Configuration object for all pump types and keys
const pumpUrls = {
  schwp: {
    schwp_p1: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P1_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P1_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    schwp_p2: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P2_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P2_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    schwp_p3: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P3_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P3_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    schwp_p4: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P4_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P4_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    schwp_p5: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P5_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P5_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    }
    // Add more SCHWP pumps if needed
  },
  cwp: {
    cwp_p1: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P1_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P1_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    cwp_p2: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P2_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P2_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    cwp_p3: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P3_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P3_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    cwp_p4: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P4_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P4_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    cwp_p5: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P5_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CWP_P5_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    }
    // Add more CWP pumps if needed
  },
  pchwp: {
    pchwp_p1: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P1_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P1_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    pchwp_p1: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P1_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P1_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    pchwp_p2: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P2_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P2_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    pchwp_p3: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P3_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P3_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    pchwp_p4: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P4_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P4_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    pchwp_p5: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P5_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/PCHWP_P5_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    }
    // Add more PCHWP pumps if needed
  },
  coolingtower: {
    coolingtower_FAN1: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN1_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN1_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    coolingtower_FAN2: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN2_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN2_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    coolingtower_FAN3: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN3_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN3_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    coolingtower_FAN4: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN4_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN4_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    coolingtower_FAN5: {
      amps: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN5_AMPS/~historyQuery?start=${startDate}&end=${endDate}',
      volts: 'https://localhost/obix/histories/SqlServerDatabase_Chiller/CoolingTower_FAN5_VOLTS/~historyQuery?start=${startDate}&end=${endDate}'
    },
    // Add more Cooling Tower pumps if needed
  }
};

// API endpoint to fetch data for all pumps
app.get('/fetch-pumps', async (req, res) => {
  try {
    const startDate = req.query.start || '2021-01-01T00:00:00.000+05:30';
    const endDate = req.query.end || '2021-12-31T00:00:00.999+05:30';

    // Append query parameters to URLs
    const urlsWithParams = Object.keys(pumpUrls).reduce((acc, pumpType) => {
      acc[pumpType] = Object.keys(pumpUrls[pumpType]).reduce((subAcc, pumpKey) => {
        subAcc[pumpKey] = {
          amps: `${pumpUrls[pumpType][pumpKey].amps}?start=${startDate}&end=${endDate}`,
          volts: `${pumpUrls[pumpType][pumpKey].volts}?start=${startDate}&end=${endDate}`
        };
        return subAcc;
      }, {});
      return acc;
    }, {});

    // Process data for all pumps
    const pumpPowers = await Promise.all(
      Object.keys(urlsWithParams).flatMap(pumpType =>
        Object.keys(urlsWithParams[pumpType]).map(pumpKey =>
          processPumpData(pumpType, pumpKey, urlsWithParams[pumpType][pumpKey])
        )
      )
    );

    res.json(pumpPowers);

  } catch (error) {
    console.error('Error processing pump data:', error);
    res.status(500).send('Internal Server Error');
  }
});



app.get('/fetch-amps', async (req, res) => {
  try {
    const startDate = req.query.start || '2021-01-01T00:00:00.000+05:30';
    const endDate = req.query.end || '2021-12-31T00:00:00.999+05:30';

    const chillerUrls = [
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C1_AMPS/~historyQuery?start=${startDate}&end=${endDate}`,
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C2_AMPS/~historyQuery?start=${startDate}&end=${endDate}`,
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C3_AMPS/~historyQuery?start=${startDate}&end=${endDate}`,
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C4_AMPS/~historyQuery?start=${startDate}&end=${endDate}`,
      `https://localhost/obix/histories/SqlServerDatabase_Chiller/C5_AMPS/~historyQuery?start=${startDate}&end=${endDate}`
    ];

    const chillerData = await Promise.all(chillerUrls.map(async (url, index) => {
      console.log(`Fetching data for Chiller ${index + 1}...`);
      
      const xmlData = await fetchWithAuth(url); // Fetch data with authentication
      console.log(`Fetched XML for Chiller ${index + 1}:`, xmlData.substring(0, 200)); // Log XML snippet

      // Parse the XML using jsdom
      const dom = new JSDOM(xmlData, { contentType: "text/xml" });
      const document = dom.window.document;

      // Get the 'real' elements from the XML (FLA values)
      const realElements = document.getElementsByTagName('real');
      const abstimeElements = document.getElementsByTagName('abstime');

      console.log(`Number of 'real' elements for Chiller ${index + 1}: ${realElements.length}`);
      console.log(`Number of 'abstime' elements for Chiller ${index + 1}: ${abstimeElements.length}`);

      // Ensure data exists
      if (realElements.length === 0 || abstimeElements.length === 0) {
        console.log(`No data for Chiller ${index + 1}`);
        return []; // Return empty array if no data is found
      }

      // Extract the FLA values and timestamps
      const values = [];
      for (let i = 0; i < realElements.length; i++) {
        const timestamp = abstimeElements[i].getAttribute('val');
        const valueStr = realElements[i].getAttribute('val');
        const value = parseFloat(valueStr);
        
        if (isNaN(value)) {
          console.warn(`Invalid value found: ${valueStr} at ${timestamp}`);
        } else {
          values.push({ timestamp, value });
        }
      }

      console.log(`Extracted values for Chiller ${index + 1}:`, values);

      // Group by month and calculate averages
      const monthlyAverages = {};
      values.forEach(({ timestamp, value }) => {
        const date = new Date(timestamp);
        const month = date.getMonth(); // Month is 0-indexed (0 = January)
        
        if (!monthlyAverages[month]) {
          monthlyAverages[month] = { total: 0, count: 0 };
        }
        monthlyAverages[month].total += value;
        monthlyAverages[month].count++;
      });

      // Log monthly averages for debugging
      console.log(`Monthly averages for Chiller ${index + 1}:`, monthlyAverages);

      // Return monthly averages
      return Object.keys(monthlyAverages).map(month => ({
        month: parseInt(month, 10),
        average: monthlyAverages[month].total / monthlyAverages[month].count,
      }));
    }));

    // Format data for all chillers
    const formattedData = {};
    for (let month = 0; month < 12; month++) {
      formattedData[month] = formattedData[month] || {};
      for (let chillerIndex = 1; chillerIndex <= chillerUrls.length; chillerIndex++) {
        if (!formattedData[month][`chiller${chillerIndex}`]) {
          formattedData[month][`chiller${chillerIndex}`] = 0;
        }
      }
    }

    chillerData.forEach((data, index) => {
      data.forEach(({ month, average }) => {
        if (!formattedData[month]) {
          formattedData[month] = {};
        }
        formattedData[month][`chiller${index + 1}`] = average;
      });
    });

    console.log('Formatted Data:', formattedData);
    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching data:', error.message);
    res.status(500).send("Error fetching data");
  }
});


app.get('/fetch-pump-data', async (req, res) => {
  try {
    const startDate = req.query.start || '2021-01-01T00:00:00.000+05:30';
    const endDate = req.query.end || '2021-12-31T00:00:00.999+05:30';

    // URLs for Pump Data (Amps and Volts)
    const pumpUrls = [
      {
        volts: `https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P1_VOLTS/~historyQuery?start=${startDate}&end=${endDate}`,
        amps: `https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P1_AMPS/~historyQuery?start=${startDate}&end=${endDate}`,
      },
      {
        volts: `https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P2_VOLTS/~historyQuery?start=${startDate}&end=${endDate}`,
        amps: `https://localhost/obix/histories/SqlServerDatabase_Chiller/SCHWP_P2_AMPS/~historyQuery?start=${startDate}&end=${endDate}`,
      },
      // Add more pumps similarly
    ];

    const pumpData = await Promise.all(pumpUrls.map(async (pump, index) => {
      console.log(`Fetching data for Pump ${index + 1}...`);

      // Fetch volts and amps data with authentication
      const voltsXml = await fetchWithAuth(pump.volts);
      const ampsXml = await fetchWithAuth(pump.amps);

      // Parse both XML responses
      const voltsDom = new JSDOM(voltsXml, { contentType: "text/xml" });
      const ampsDom = new JSDOM(ampsXml, { contentType: "text/xml" });

      const voltsReal = voltsDom.window.document.getElementsByTagName('real');
      const ampsReal = ampsDom.window.document.getElementsByTagName('real');
      const timestamps = voltsDom.window.document.getElementsByTagName('abstime');

      console.log(`Number of data points for Pump ${index + 1}:`, voltsReal.length, ampsReal.length);

      if (voltsReal.length === 0 || ampsReal.length === 0) {
        console.log(`No data for Pump ${index + 1}`);
        return [];
      }

      // Calculate total power (AMPS x VOLTS)
      const totalPowerValues = [];
      for (let i = 0; i < voltsReal.length; i++) {
        const timestamp = timestamps[i].getAttribute('val');
        const voltsValue = parseFloat(voltsReal[i].getAttribute('val'));
        const ampsValue = parseFloat(ampsReal[i].getAttribute('val'));

        if (!isNaN(voltsValue) && !isNaN(ampsValue)) {
          const totalPower = voltsValue * ampsValue;
          totalPowerValues.push({ timestamp, totalPower });
        }
      }

      console.log(`Total power for Pump ${index + 1}:`, totalPowerValues);
      
      return totalPowerValues;
    }));

    // Format the data
    const formattedData = {};
    pumpData.forEach((data, index) => {
      data.forEach(({ timestamp, totalPower }) => {
        const date = new Date(timestamp).toISOString().slice(0, 10);
        if (!formattedData[date]) {
          formattedData[date] = {};
        }
        formattedData[date][`Pump${index + 1}`] = totalPower;
      });
    });

    console.log('Formatted Data:', formattedData);
    res.json(formattedData);
  } catch (error) {
    console.error('Error fetching pump data:', error.message);
    res.status(500).send("Error fetching pump data");
  }
});
app.get('/fetch-chiller-data', async (req, res) => {
  try {
    const selectedChiller = req.query.chiller || 'C1'; // Default to Chiller 1
    const startDate = req.query.start || '2021-01-01T00:00:00.000+05:30';
    const endDate = req.query.end || '2021-12-31T00:00:00.999+05:30';

    // URLs for the selected Chiller data
    const urls = {
      amps: `https://localhost/obix/histories/SqlServerDatabase_Chiller/${selectedChiller}_AMPS/~historyQuery?start=${startDate}&end=${endDate}`,
      retTemp: `https://localhost/obix/histories/SqlServerDatabase_Chiller/${selectedChiller}_EVP_RET_TEMP/~historyQuery?start=${startDate}&end=${endDate}`,
      leavTemp: `https://localhost/obix/histories/SqlServerDatabase_Chiller/${selectedChiller}_EVP_LEAV_TEMP/~historyQuery?start=${startDate}&end=${endDate}`,
      retTempCon: `https://localhost/obix/histories/SqlServerDatabase_Chiller/${selectedChiller}_CON_RET_TEMP/~historyQuery?start=${startDate}&end=${endDate}`,
    };

    // Fetch data concurrently using Promise.all
    const pumpUrls = Object.values(urls);
    const pumpData = await Promise.all(pumpUrls.map(async (url) => {
      const xmlResponse = await fetchWithAuth(url);
      return new JSDOM(xmlResponse, { contentType: "text/xml" });
    }));

    // Extract data from each parsed XML response
    const [ampsDom, retTempDom, leavTempDom, retTempConDom] = pumpData;
    const ampsData = ampsDom.window.document.getElementsByTagName('real');
    const retTempData = retTempDom.window.document.getElementsByTagName('real');
    const leavTempData = leavTempDom.window.document.getElementsByTagName('real');
    const retTempConData = retTempConDom.window.document.getElementsByTagName('real');
    const timestamps = ampsDom.window.document.getElementsByTagName('abstime');

    // Initialize an array to store chiller data
    const chillerData = [];

    // Use forEach loop for data extraction and calculation
    [...ampsData].forEach((_, i) => {
      const timestamp = timestamps[i].getAttribute('val');
      const ampsValue = parseFloat(ampsData[i].getAttribute('val'));
      const retTempValue = parseFloat(retTempData[i].getAttribute('val'));
      const leavTempValue = parseFloat(leavTempData[i].getAttribute('val'));
      const retTempConValue = parseFloat(retTempConData[i].getAttribute('val'));

      const deltaTEvp = retTempValue - leavTempValue; // Evaporator ΔT
      const deltaTCon = retTempConValue - leavTempValue; // Condenser ΔT

      chillerData.push({
        timestamp,
        amps: ampsValue,
        deltaTEvp,
        deltaTCon,
      });
    });

    // Group data by month and calculate monthly averages
    const monthlyData = {};
    chillerData.forEach(({ timestamp, amps, deltaTEvp, deltaTCon }) => {
      const month = new Date(timestamp).toISOString().slice(0, 7); // YYYY-MM format
      if (!monthlyData[month]) {
        monthlyData[month] = { amps: 0, deltaTEvp: 0, deltaTCon: 0, count: 0 };
      }
      monthlyData[month].amps += amps;
      monthlyData[month].deltaTEvp += deltaTEvp;
      monthlyData[month].deltaTCon += deltaTCon;
      monthlyData[month].count += 1;
    });

    // Calculate monthly averages
    const monthlyAverages = Object.keys(monthlyData).map((month) => {
      return {
        month,
        avgAmps: monthlyData[month].amps / monthlyData[month].count,
        avgDeltaTEvp: monthlyData[month].deltaTEvp / monthlyData[month].count,
        avgDeltaTCon: monthlyData[month].deltaTCon / monthlyData[month].count,
      };
    });

    // Calculate total operating hours
    const totalOperatingHours = new Set(
      chillerData
        .filter(data => data.amps > 0) // Only include entries with valid amps values
        .map(data => new Date(data.timestamp).toISOString().slice(0, 13)) // Unique hours
    );
    const totalHours = totalOperatingHours.size;

    // Send the final data as a response
    res.json({totalOperatingHours: totalHours, monthlyAverages });
  } catch (error) {
    console.error('Error fetching chiller data:', error.message);
    res.status(500).send('Error fetching chiller data');
  }
});






// Your existing routes and logic
app.post("/stripe-webhooks-endpoint", bodyParser.raw({ type: 'application/json' }), function (req, res) {
  console.log(req.body);
  res.send(req.body);
});

app.get("/ahu", function (_req, res) {
  app.set('view engine', 'html');
  res.sendFile(__dirname + "/ahu.html");
});

app.post("/logout", function (_req, res) {
  res.clearCookie("JSESSIONID");
  res.send('<script>window.location.href="https://localhost/logout";</script>');
  res.end();
});

app.get("/index.html", function (_req, res) {
  res.sendFile(__dirname + "/index.html");
});

httpServer.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});