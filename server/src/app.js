const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const config = require("./config");
const { pool } = require("./db");
const { verifySession } = require("./utils/jwt");
const { ensureMasterUser } = require("./services/users");
const authRoutes = require("./routes/auth");
const directoryRoutes = require("./routes/directory");
const characterRoutes = require("./routes/characters");
const rulesRoutes = require("./routes/rules");
const transferRoutes = require("./routes/transfers");

function resolveCorsOrigin(origin, callback) {
  if (!origin || !config.corsOrigins.length || config.corsOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error("Origem nao permitida pelo servidor."), false);
}

async function main() {
  if (!config.databaseUrl) {
    throw new Error("Defina DATABASE_URL no arquivo .env do backend.");
  }

  await pool.query("select 1");
  await ensureMasterUser();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: config.corsOrigins.length ? config.corsOrigins : true,
      credentials: true
    }
  });

  app.set("io", io);

  app.use(
    cors({
      origin: resolveCorsOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "armagedon-server"
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/directory", directoryRoutes);
  app.use("/api/characters", characterRoutes);
  app.use("/api/rules", rulesRoutes);
  app.use("/api/transfers", transferRoutes);

  app.use((_req, res) => {
    res.status(404).json({
      error: "Rota nao encontrada."
    });
  });

  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({
      error: error.message || "Erro interno do servidor.",
      code: error.code || "internal_error"
    });
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      String(socket.handshake.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (!token) {
      next(new Error("Sessao ausente."));
      return;
    }

    try {
      socket.user = verifySession(token);
      next();
    } catch {
      next(new Error("Sessao invalida."));
    }
  });

  io.on("connection", socket => {
    const user = socket.user;
    socket.join(`user:${user.sub}`);
    socket.join(`role:${user.role}`);
    if (user.role === "player") {
      socket.join(`character:${user.username}`);
    }
  });

  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Armagedon backend ativo em http://localhost:${config.port}`);
  });
}

main().catch(error => {
  // eslint-disable-next-line no-console
  console.error("Falha ao iniciar o backend:", error);
  process.exit(1);
});
