const express = require("express");
const cors = require("cors");
require("dotenv").config();
const telemetryRoutes = require("./routes/telemetry.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "telemetry-engine"
    });
});

app.use("/api/telemetry", telemetryRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telemetry Engine running on port ${PORT}`);
});