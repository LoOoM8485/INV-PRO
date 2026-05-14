import React, { useEffect, useMemo, useState } from "react";

const TABLES = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15];
const SEATS = [1, 2, 3, 5, 6, 7, 8, 9];
const INV_IDS = Array.from({ length: 56 }, (_, i) => i * 2 + 1);
const PRO_IDS = Array.from({ length: 56 }, (_, i) => i * 2 + 2);
const STORAGE_KEY = "inv-pro-table-planner-v7";

function getPairId(id) {
  return id % 2 === 1 ? id + 1 : id - 1;
}

function emptyPlayer(id, type) {
  return { id, type, table: "", seat: "", eliminated: false };
}

function createInitialState() {
  return {
    inv: INV_IDS.map((id) => emptyPlayer(id, "INV")),
    pro: PRO_IDS.map((id) => emptyPlayer(id, "PRO")),
    visibleMaxTable: 15,
    lastBreakSnapshot: null,
  };
}

function loadSavedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...createInitialState(), ...JSON.parse(saved) };
  } catch {}
  return createInitialState();
}

function playerHasSeat(player) {
  return player.table !== "" && player.seat !== "" && !player.eliminated;
}

function cryptoRandomIndex(maxExclusive) {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % maxExclusive;
}

function cryptoShuffle(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i--) {
    const j = cryptoRandomIndex(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function useScreenSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const update = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return size;
}

export default function App() {
  const [state, setState] = useState(loadSavedState);
  const screen = useScreenSize();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const visibleTables = TABLES.filter(
    (table) => Number(table) <= Number(state.visibleMaxTable)
  );

  const allPlayers = useMemo(
    () => [...state.inv, ...state.pro],
    [state.inv, state.pro]
  );

  const livePlayers = allPlayers.filter(playerHasSeat);
  const invLive = state.inv.filter(playerHasSeat).length;
  const proLive = state.pro.filter(playerHasSeat).length;

  const playerById = useMemo(() => {
    const map = new Map();
    allPlayers.forEach((player) => map.set(player.id, player));
    return map;
  }, [allPlayers]);

  const occupiedSeats = useMemo(() => {
    const map = new Map();
    allPlayers.forEach((player) => {
      if (playerHasSeat(player)) {
        map.set(`${player.table}-${player.seat}`, player.id);
      }
    });
    return map;
  }, [allPlayers]);

  const tablesInPlay = useMemo(() => {
    return TABLES.filter((table) =>
      allPlayers.some(
        (player) =>
          Number(player.table) === Number(table) &&
          player.seat !== "" &&
          !player.eliminated
      )
    );
  }, [allPlayers]);

  const highestTableInPlay =
    tablesInPlay.length > 0 ? Math.max(...tablesInPlay) : "";

  function updatePlayer(type, id, patch) {
    setState((current) => {
      const key = type === "INV" ? "inv" : "pro";

      return {
        ...current,
        [key]: current[key].map((player) =>
          player.id === id ? { ...player, ...patch } : player
        ),
      };
    });
  }

  function setPlayerTable(type, id, table) {
    updatePlayer(type, id, {
      table,
      seat: "",
      eliminated: false,
    });
  }

  function setPlayerSeat(type, id, seat) {
    updatePlayer(type, id, {
      seat,
      eliminated: false,
    });
  }

  function toggleEliminated(type, id) {
    const player = playerById.get(id);
    if (!player) return;

    updatePlayer(type, id, {
      eliminated: !player.eliminated,
      table: !player.eliminated ? "" : player.table,
      seat: !player.eliminated ? "" : player.seat,
    });
  }

  function getUnavailableTableForPlayer(id) {
    const pair = playerById.get(getPairId(id));
    if (!pair || !playerHasSeat(pair)) return "";
    return pair.table;
  }

  function getAvailableSeatsForPlayer(player) {
    if (!player.table) return [];

    return SEATS.filter((seat) => {
      const key = `${player.table}-${seat}`;
      const occupantId = occupiedSeats.get(key);
      return !occupantId || occupantId === player.id;
    });
  }

  function changeVisibleMaxTable(value) {
    setState((current) => ({ ...current, visibleMaxTable: value }));
  }

  function undoBreak() {
    if (!state.lastBreakSnapshot) {
      alert("No table break to undo.");
      return;
    }

    if (!window.confirm("Undo the last table break?")) return;

    setState({
      ...state.lastBreakSnapshot,
      lastBreakSnapshot: null,
    });
  }

  function findRandomBreakAssignments({
    breakingPlayers,
    lowerTables,
    currentOccupied,
    playerById,
    breakingTable,
  }) {
    const breakingIds = new Set(breakingPlayers.map((p) => p.id));

    function getPairTable(player, assignments) {
      const pairId = getPairId(player.id);

      if (assignments.has(pairId)) {
        return Number(assignments.get(pairId).table);
      }

      const pair = playerById.get(pairId);

      if (
        pair &&
        playerHasSeat(pair) &&
        !breakingIds.has(pair.id) &&
        Number(pair.table) !== Number(breakingTable)
      ) {
        return Number(pair.table);
      }

      return "";
    }

    function getCandidates(player, occupied, assignments) {
      const blockedTable = getPairTable(player, assignments);
      const candidates = [];

      for (const table of cryptoShuffle(lowerTables)) {
        if (Number(table) === Number(blockedTable)) continue;

        for (const seat of cryptoShuffle(SEATS)) {
          const key = `${table}-${seat}`;
          if (!occupied.has(key)) {
            candidates.push({
              table: String(table),
              seat: String(seat),
              key,
            });
          }
        }
      }

      return cryptoShuffle(candidates);
    }

    function solve(unassigned, occupied, assignments) {
      if (unassigned.length === 0) return assignments;

      const rankedPlayers = cryptoShuffle(unassigned)
        .map((player) => ({
          player,
          candidates: getCandidates(player, occupied, assignments),
        }))
        .sort((a, b) => a.candidates.length - b.candidates.length);

      const chosen = rankedPlayers[0];
      if (chosen.candidates.length === 0) return null;

      const remaining = unassigned.filter((p) => p.id !== chosen.player.id);

      for (const candidate of chosen.candidates) {
        const nextOccupied = new Map(occupied);
        const nextAssignments = new Map(assignments);

        nextOccupied.set(candidate.key, chosen.player.id);
        nextAssignments.set(chosen.player.id, {
          table: candidate.table,
          seat: candidate.seat,
        });

        const result = solve(remaining, nextOccupied, nextAssignments);
        if (result) return result;
      }

      return null;
    }

    for (let attempt = 0; attempt < 300; attempt++) {
      const result = solve(
        cryptoShuffle(breakingPlayers),
        new Map(currentOccupied),
        new Map()
      );

      if (result) return result;
    }

    return null;
  }

  function breakTable() {
    if (!highestTableInPlay) {
      alert("No table is currently in play.");
      return;
    }

    if (!window.confirm(`Do you really want to break Table ${highestTableInPlay}?`)) {
      return;
    }

    const breakingPlayers = allPlayers.filter(
      (player) =>
        Number(player.table) === Number(highestTableInPlay) &&
        player.seat !== "" &&
        !player.eliminated
    );

    const lowerTables = TABLES.filter(
      (table) => Number(table) < Number(highestTableInPlay)
    );

    const currentOccupied = new Map(occupiedSeats);

    breakingPlayers.forEach((player) => {
      currentOccupied.delete(`${player.table}-${player.seat}`);
    });

    const assignments = findRandomBreakAssignments({
      breakingPlayers,
      lowerTables,
      currentOccupied,
      playerById,
      breakingTable: highestTableInPlay,
    });

    if (!assignments) {
      alert(`Cannot break Table ${highestTableInPlay}. Not enough legal seats available.`);
      return;
    }

    const snapshotBeforeBreak = JSON.parse(JSON.stringify(state));

    setState((current) => ({
      ...current,
      lastBreakSnapshot: snapshotBeforeBreak,
      inv: current.inv.map((player) =>
        assignments.has(player.id)
          ? { ...player, ...assignments.get(player.id) }
          : player
      ),
      pro: current.pro.map((player) =>
        assignments.has(player.id)
          ? { ...player, ...assignments.get(player.id) }
          : player
      ),
    }));
  }

  const styles = makeStyles(screen);

  return (
    <div style={styles.page}>
      <div style={styles.app}>
        <header style={styles.header}>
          <div style={styles.logoBox}>
            <img src="/logo.png" alt="Logo" style={styles.logo} />
            <h1 style={styles.title}>INV / PRO TABLE PLANNER</h1>
          </div>

          <div style={styles.countBox}>
            <button onClick={undoBreak} style={styles.undoButton}>
              UNDO BREAK
            </button>

            <div style={styles.countCardTotal}>
              <div style={styles.countLabel}>TOTAL</div>
              <div style={styles.countValue}>{livePlayers.length}</div>
            </div>

            <div style={styles.countCardInv}>
              <div style={styles.countLabel}>INV</div>
              <div style={styles.countValue}>{invLive}</div>
            </div>

            <div style={styles.countCardPro}>
              <div style={styles.countLabel}>PRO</div>
              <div style={styles.countValue}>{proLive}</div>
            </div>

            <button onClick={breakTable} style={styles.breakButton}>
              BREAK {highestTableInPlay ? `T${highestTableInPlay}` : ""}
            </button>
          </div>
        </header>

        <main style={styles.mainGrid}>
          <section style={styles.tableOverview}>
            <div style={styles.overviewHeader}>
              <h2 style={styles.sectionTitle}>TABLES</h2>

              <label style={styles.overviewLabel}>
                SHOW
                <select
                  value={state.visibleMaxTable}
                  onChange={(e) => changeVisibleMaxTable(Number(e.target.value))}
                  style={styles.overviewSelect}
                >
                  {TABLES.map((table) => (
                    <option key={table} value={table}>
                      {table}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={styles.tablesGrid}>
              {visibleTables.map((table) => (
                <TableCard
                  key={table}
                  table={table}
                  allPlayers={allPlayers}
                  styles={styles}
                />
              ))}
            </div>
          </section>

          <section style={styles.listWrapper}>
            <PlayerList
              title="INV"
              players={state.inv}
              allowedTables={visibleTables}
              updateTable={setPlayerTable}
              updateSeat={setPlayerSeat}
              toggleEliminated={toggleEliminated}
              getUnavailableTableForPlayer={getUnavailableTableForPlayer}
              getAvailableSeatsForPlayer={getAvailableSeatsForPlayer}
              styles={styles}
            />
          </section>

          <section style={styles.listWrapper}>
            <PlayerList
              title="PRO"
              players={state.pro}
              allowedTables={visibleTables}
              updateTable={setPlayerTable}
              updateSeat={setPlayerSeat}
              toggleEliminated={toggleEliminated}
              getUnavailableTableForPlayer={getUnavailableTableForPlayer}
              getAvailableSeatsForPlayer={getAvailableSeatsForPlayer}
              styles={styles}
            />
          </section>
        </main>
      </div>
    </div>
  );
}

function TableCard({ table, allPlayers, styles }) {
  const seats = SEATS.map((seat) => {
    const player = allPlayers.find(
      (p) =>
        Number(p.table) === Number(table) &&
        Number(p.seat) === Number(seat) &&
        !p.eliminated
    );

    return { seat, player };
  });

  return (
    <div style={styles.tableCard}>
      <div style={styles.tableCardTitle}>T{table}</div>

      <div style={styles.seatGrid}>
        {seats.map(({ seat, player }) => (
          <div key={seat} style={styles.seatBox}>
            <div style={styles.seatNumber}>
              <span>S{seat}</span>
              {player ? (
                <span style={styles.pairWarning}>{getPairId(player.id)}</span>
              ) : null}
            </div>

            <div
              style={{
                ...styles.seatId,
                ...(player?.type === "INV" ? styles.invSeat : {}),
                ...(player?.type === "PRO" ? styles.proSeat : {}),
              }}
            >
              {player ? player.id : "-"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerList({
  title,
  players,
  allowedTables,
  updateTable,
  updateSeat,
  toggleEliminated,
  getUnavailableTableForPlayer,
  getAvailableSeatsForPlayer,
  styles,
}) {
  return (
    <section style={styles.listCard}>
      <h2
        style={{
          ...styles.sectionTitle,
          ...(title === "INV" ? styles.invTitle : styles.proTitle),
        }}
      >
        {title}
      </h2>

      <div style={styles.playerHeader}>
        <div>ID</div>
        <div>NO</div>
        <div>T</div>
        <div>S</div>
        <div>OUT</div>
      </div>

      <div style={styles.listScroll}>
        {players.map((player) => {
          const blockedTable = getUnavailableTableForPlayer(player.id);
          const availableSeats = getAvailableSeatsForPlayer(player);

          const tableOptions = allowedTables.filter(
            (table) => Number(table) !== Number(blockedTable)
          );

          return (
            <div
              key={player.id}
              style={{
                ...styles.playerRow,
                ...(player.eliminated ? styles.eliminatedRow : {}),
              }}
            >
              <div style={styles.idCell}>{player.id}</div>

              <div style={styles.noCell}>
                {blockedTable ? (
                  <span style={styles.blockedTable}>T {blockedTable}</span>
                ) : (
                  <span style={styles.okTable}>OK</span>
                )}
              </div>

              <select
                value={player.table}
                disabled={player.eliminated}
                onChange={(e) => updateTable(title, player.id, e.target.value)}
                style={styles.tableSelect}
              >
                <option value="">-</option>
                {tableOptions.map((table) => (
                  <option key={table} value={table}>
                    {table}
                  </option>
                ))}
              </select>

              <select
                value={player.seat}
                disabled={player.eliminated || !player.table}
                onChange={(e) => updateSeat(title, player.id, e.target.value)}
                style={styles.seatSelect}
              >
                <option value="">-</option>
                {availableSeats.map((seat) => (
                  <option key={seat} value={seat}>
                    {seat}
                  </option>
                ))}
              </select>

              <input
                type="checkbox"
                checked={player.eliminated}
                onChange={() => toggleEliminated(title, player.id)}
                style={styles.checkbox}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function makeStyles(screen) {
  const overviewWidth = Math.max(120, Math.min(190, Math.round(screen.width * 0.15)));
  const workingHeight = Math.max(430, screen.height - 112);

  return {
    page: {
      height: "100vh",
      background: "#e5e7eb",
      padding: 6,
      boxSizing: "border-box",
      fontFamily: "Arial, Helvetica, sans-serif",
      overflow: "hidden",
    },

    app: {
      height: "100%",
      width: "100%",
      margin: "0 auto",
      background: "white",
      borderRadius: 12,
      padding: 8,
      boxSizing: "border-box",
      boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
      overflow: "hidden",
    },

    header: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 8,
      alignItems: "center",
      marginBottom: 6,
    },

    logoBox: {
      textAlign: "center",
    },

    logo: {
      height: 52,
      maxWidth: 210,
      objectFit: "contain",
    },

    title: {
      margin: 0,
      fontSize: 17,
      fontWeight: 900,
      color: "#111827",
    },

    countBox: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 5,
      flexWrap: "wrap",
    },

    countCardTotal: {
      border: "2px solid #111827",
      borderRadius: 8,
      minWidth: 58,
      padding: 3,
      textAlign: "center",
      background: "#f8fafc",
    },

    countCardInv: {
      border: "2px solid #d6b94c",
      borderRadius: 8,
      minWidth: 58,
      padding: 3,
      textAlign: "center",
      background: "#fef3c7",
    },

    countCardPro: {
      border: "2px solid #93c5fd",
      borderRadius: 8,
      minWidth: 58,
      padding: 3,
      textAlign: "center",
      background: "#dbeafe",
    },

    countLabel: {
      fontSize: 8,
      fontWeight: 900,
      color: "#475569",
    },

    countValue: {
      fontSize: 19,
      fontWeight: 900,
      color: "#111827",
    },

    undoButton: {
      border: "2px solid #475569",
      background: "#64748b",
      color: "white",
      fontWeight: 900,
      borderRadius: 8,
      padding: "9px 10px",
      fontSize: 12,
      cursor: "pointer",
    },

    breakButton: {
      border: "2px solid #b91c1c",
      background: "#ef4444",
      color: "white",
      fontWeight: 900,
      borderRadius: 8,
      padding: "9px 10px",
      fontSize: 12,
      cursor: "pointer",
    },

    mainGrid: {
      height: workingHeight,
      display: "grid",
      gridTemplateColumns: `${overviewWidth}px minmax(380px, 1fr) minmax(380px, 1fr)`,
      gap: 8,
      alignItems: "start",
      overflow: "hidden",
    },

    tableOverview: {
      height: "100%",
      border: "2px solid #111827",
      borderRadius: 10,
      padding: 4,
      background: "#f8fafc",
      boxSizing: "border-box",
      overflowY: "auto",
    },

    listWrapper: {
      height: "100%",
      overflow: "hidden",
    },

    overviewHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 4,
      marginBottom: 5,
      position: "sticky",
      top: 0,
      background: "#f8fafc",
      zIndex: 5,
      paddingBottom: 3,
    },

    overviewLabel: {
      fontSize: 8,
      fontWeight: 900,
      color: "#111827",
    },

    overviewSelect: {
      display: "block",
      marginTop: 1,
      padding: 2,
      fontSize: 10,
      fontWeight: 900,
      borderRadius: 5,
      border: "1px solid #94a3b8",
      background: "white",
      color: "#000",
      width: 48,
    },

    sectionTitle: {
      margin: 0,
      textAlign: "center",
      fontSize: 13,
      fontWeight: 900,
      color: "#111827",
    },

    invTitle: {
      color: "#b45309",
    },

    proTitle: {
      color: "#1d4ed8",
    },

    tablesGrid: {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 4,
      alignItems: "start",
    },

    tableCard: {
      border: "1px solid #334155",
      borderRadius: 6,
      overflow: "hidden",
      background: "white",
      width: "100%",
      boxSizing: "border-box",
    },

    tableCardTitle: {
      background: "#111827",
      color: "white",
      fontWeight: 900,
      textAlign: "center",
      padding: "2px 0",
      fontSize: 10,
    },

    seatGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 1,
      padding: 2,
      background: "#cbd5e1",
    },

    seatBox: {
      background: "white",
      borderRadius: 4,
      overflow: "hidden",
      border: "1px solid #94a3b8",
    },

    seatNumber: {
      background: "#e2e8f0",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: 7,
      fontWeight: 900,
      color: "#334155",
      padding: "0 1px",
    },

    pairWarning: {
      color: "#dc2626",
      fontWeight: 900,
      fontSize: 7,
    },

    seatId: {
      minHeight: 14,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 9,
      fontWeight: 900,
      color: "#111827",
    },

    invSeat: {
      background: "#fef3c7",
    },

    proSeat: {
      background: "#dbeafe",
    },

    listCard: {
      height: "100%",
      border: "2px solid #111827",
      borderRadius: 10,
      padding: 5,
      background: "#f8fafc",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    },

    listScroll: {
      overflowY: "auto",
      paddingRight: 2,
    },

    playerHeader: {
      display: "grid",
      gridTemplateColumns: "40px 48px 1fr 1fr 38px",
      gap: 3,
      background: "#334155",
      color: "white",
      fontSize: 10,
      fontWeight: 900,
      textAlign: "center",
      padding: 3,
      borderRadius: 6,
      marginBottom: 3,
      flexShrink: 0,
    },

    playerRow: {
      display: "grid",
      gridTemplateColumns: "40px 48px 1fr 1fr 38px",
      gap: 3,
      background: "#cbd5e1",
      padding: 3,
      borderRadius: 6,
      marginBottom: 3,
      alignItems: "center",
    },

    eliminatedRow: {
      opacity: 0.45,
    },

    idCell: {
      background: "white",
      borderRadius: 5,
      textAlign: "center",
      fontSize: 13,
      fontWeight: 900,
      padding: "4px 0",
    },

    noCell: {
      background: "white",
      borderRadius: 5,
      textAlign: "center",
      fontSize: 11,
      fontWeight: 900,
      padding: "4px 0",
    },

    blockedTable: {
      background: "#ef4444",
      color: "white",
      padding: "2px 5px",
      borderRadius: 5,
    },

    okTable: {
      color: "#15803d",
    },

    tableSelect: {
      width: "100%",
      minHeight: 26,
      borderRadius: 5,
      border: "1px solid #94a3b8",
      background: "white",
      color: "#000",
      fontWeight: 900,
      textAlign: "center",
    },

    seatSelect: {
      width: "100%",
      minHeight: 26,
      borderRadius: 5,
      border: "1px solid #d6b94c",
      background: "#fef3c7",
      color: "#000",
      fontWeight: 900,
      textAlign: "center",
    },

    checkbox: {
      width: 22,
      height: 22,
      margin: "0 auto",
    },
  };
}