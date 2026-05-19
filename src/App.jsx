import React, { useEffect, useMemo, useState } from "react";
import { db } from "./firebase";

import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";

const TABLES = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15];
const SEATS = [1, 2, 3, 5, 6, 7, 8, 9];

const INV_IDS = Array.from({ length: 56 }, (_, i) => i * 2 + 1);
const PRO_IDS = Array.from({ length: 56 }, (_, i) => i * 2 + 2);

const DOC_REF = doc(db, "planner", "main");

function getPairId(id) {
  return id % 2 === 1 ? id + 1 : id - 1;
}

function emptyPlayer(id, type) {
  return {
    id,
    type,
    table: "",
    seat: "",
    eliminated: false,
  };
}

function createInitialState() {
  return {
    inv: INV_IDS.map((id) => emptyPlayer(id, "INV")),
    pro: PRO_IDS.map((id) => emptyPlayer(id, "PRO")),
    visibleMaxTable: 15,
    lastBreakSnapshot: null,
  };
}

function playerHasSeat(player) {
  return (
    player.table !== "" &&
    player.seat !== "" &&
    !player.eliminated
  );
}

export default function App() {
  const [state, setState] = useState(createInitialState());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function init() {
      const snap = await getDoc(DOC_REF);

      if (!snap.exists()) {
        await setDoc(DOC_REF, createInitialState());
      }

      onSnapshot(DOC_REF, (snapshot) => {
        if (snapshot.exists()) {
          setState(snapshot.data());
          setLoaded(true);
        }
      });
    }

    init();
  }, []);

  async function saveState(newState) {
    setState(newState);
    await setDoc(DOC_REF, newState);
  }

  const visibleTables = TABLES.filter(
    (table) => Number(table) <= Number(state.visibleMaxTable)
  );

  const allPlayers = useMemo(
    () => [...state.inv, ...state.pro],
    [state.inv, state.pro]
  );

  const playerById = useMemo(() => {
    const map = new Map();

    allPlayers.forEach((p) => {
      map.set(p.id, p);
    });

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

  const livePlayers = allPlayers.filter(playerHasSeat);

  const invLive = state.inv.filter(playerHasSeat).length;
  const proLive = state.pro.filter(playerHasSeat).length;

  const tablesInPlay = TABLES.filter((table) =>
    allPlayers.some(
      (player) =>
        Number(player.table) === Number(table) &&
        player.seat !== "" &&
        !player.eliminated
    )
  );

  const highestTableInPlay =
    tablesInPlay.length > 0
      ? Math.max(...tablesInPlay)
      : "";

  function updatePlayer(type, id, patch) {
    const key = type === "INV" ? "inv" : "pro";

    const newState = {
      ...state,
      [key]: state[key].map((player) =>
        player.id === id
          ? { ...player, ...patch }
          : player
      ),
    };

    saveState(newState);
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

  if (!loaded) {
    return (
      <div
        style={{
          padding: 40,
          fontFamily: "Arial",
        }}
      >
        Loading planner...
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <img
          src="/logo.png"
          alt="logo"
          style={styles.logo}
        />

        <div style={styles.counterRow}>
          <div style={styles.totalBox}>
            TOTAL {livePlayers.length}
          </div>

          <div style={styles.invBox}>
            INV {invLive}
          </div>

          <div style={styles.proBox}>
            PRO {proLive}
          </div>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.tablesColumn}>
          {visibleTables.map((table) => (
            <TableCard
              key={table}
              table={table}
              allPlayers={allPlayers}
            />
          ))}
        </div>

        <div style={styles.listArea}>
          <PlayerList
            title="INV"
            players={state.inv}
            allPlayers={allPlayers}
            allowedTables={visibleTables}
            updateTable={setPlayerTable}
            updateSeat={setPlayerSeat}
            toggleEliminated={toggleEliminated}
            getUnavailableTableForPlayer={
              getUnavailableTableForPlayer
            }
            getAvailableSeatsForPlayer={
              getAvailableSeatsForPlayer
            }
          />

          <PlayerList
            title="PRO"
            players={state.pro}
            allPlayers={allPlayers}
            allowedTables={visibleTables}
            updateTable={setPlayerTable}
            updateSeat={setPlayerSeat}
            toggleEliminated={toggleEliminated}
            getUnavailableTableForPlayer={
              getUnavailableTableForPlayer
            }
            getAvailableSeatsForPlayer={
              getAvailableSeatsForPlayer
            }
          />
        </div>
      </div>
    </div>
  );
}

function TableCard({ table, allPlayers }) {
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
      <div style={styles.tableTitle}>
        T{table}
      </div>

      <div style={styles.seatGrid}>
        {seats.map(({ seat, player }) => (
          <div key={seat} style={styles.seatBox}>
            <div style={styles.seatLabel}>
              S{seat}
            </div>

            <div
              style={{
                ...styles.seatId,
                ...(player?.type === "INV"
                  ? styles.invSeat
                  : {}),
                ...(player?.type === "PRO"
                  ? styles.proSeat
                  : {}),
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
  allPlayers,
  allowedTables,
  updateTable,
  updateSeat,
  toggleEliminated,
  getUnavailableTableForPlayer,
  getAvailableSeatsForPlayer,
}) {
  return (
    <div style={styles.listCard}>
      <div style={styles.listTitle}>
        {title}
      </div>

      {players.map((player) => {
        const blockedTable =
          getUnavailableTableForPlayer(player.id);

        const availableSeats =
          getAvailableSeatsForPlayer(player);

        const tableOptions = allowedTables.filter(
          (table) => {
            if (
              Number(table) === Number(blockedTable)
            )
              return false;

            if (
              Number(player.table) === Number(table)
            )
              return true;

            const hasFreeSeat = SEATS.some(
              (seat) => {
                const occupied =
                  allPlayers.some(
                    (p) =>
                      p.id !== player.id &&
                      Number(p.table) ===
                        Number(table) &&
                      Number(p.seat) ===
                        Number(seat) &&
                      !p.eliminated
                  );

                return !occupied;
              }
            );

            return hasFreeSeat;
          }
        );

        return (
          <div
            key={player.id}
            style={styles.playerRow}
          >
            <div style={styles.idCell}>
              {player.id}
            </div>

            <div style={styles.noCell}>
              {blockedTable
                ? `T${blockedTable}`
                : "OK"}
            </div>

            <select
              value={player.table}
              onChange={(e) =>
                updateTable(
                  title,
                  player.id,
                  e.target.value
                )
              }
              style={styles.select}
            >
              <option value="">-</option>

              {tableOptions.map((table) => (
                <option
                  key={table}
                  value={table}
                >
                  {table}
                </option>
              ))}
            </select>

            <select
              value={player.seat}
              onChange={(e) =>
                updateSeat(
                  title,
                  player.id,
                  e.target.value
                )
              }
              style={styles.select}
            >
              <option value="">-</option>

              {availableSeats.map((seat) => (
                <option
                  key={seat}
                  value={seat}
                >
                  {seat}
                </option>
              ))}
            </select>

            <input
              type="checkbox"
              checked={player.eliminated}
              onChange={() =>
                toggleEliminated(title, player.id)
              }
            />
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  page: {
    background: "#e5e7eb",
    minHeight: "100vh",
    padding: 8,
    fontFamily: "Arial",
  },

  header: {
    textAlign: "center",
    marginBottom: 10,
  },

  logo: {
    height: 60,
    objectFit: "contain",
  },

  counterRow: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
    marginTop: 6,
  },

  totalBox: {
    background: "white",
    padding: "6px 10px",
    borderRadius: 8,
    fontWeight: 900,
  },

  invBox: {
    background: "#fef3c7",
    padding: "6px 10px",
    borderRadius: 8,
    fontWeight: 900,
  },

  proBox: {
    background: "#dbeafe",
    padding: "6px 10px",
    borderRadius: 8,
    fontWeight: 900,
  },

  main: {
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
  },

  tablesColumn: {
    width: 220,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  listArea: {
    display: "flex",
    gap: 8,
    overflowY: "auto",
    maxHeight: "85vh",
  },

  listCard: {
    width: 180,
    background: "white",
    borderRadius: 10,
    padding: 4,
  },

  listTitle: {
    textAlign: "center",
    fontWeight: 900,
    marginBottom: 4,
  },

  playerRow: {
    display: "grid",
    gridTemplateColumns:
      "28px 38px 42px 42px 20px",
    gap: 2,
    marginBottom: 2,
    alignItems: "center",
  },

  idCell: {
    background: "white",
    borderRadius: 4,
    textAlign: "center",
    fontWeight: 900,
    fontSize: 10,
  },

  noCell: {
    background: "#fee2e2",
    borderRadius: 4,
    textAlign: "center",
    fontWeight: 900,
    fontSize: 9,
  },

  select: {
    width: "100%",
    height: 22,
    borderRadius: 4,
    fontWeight: 900,
  },

  tableCard: {
    background: "white",
    borderRadius: 8,
    overflow: "hidden",
  },

  tableTitle: {
    background: "#111827",
    color: "white",
    textAlign: "center",
    fontWeight: 900,
    padding: 2,
  },

  seatGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, 1fr)",
    gap: 2,
    padding: 2,
  },

  seatBox: {
    border: "1px solid #cbd5e1",
    borderRadius: 4,
  },

  seatLabel: {
    textAlign: "center",
    fontSize: 8,
    background: "#e2e8f0",
  },

  seatId: {
    textAlign: "center",
    fontWeight: 900,
    minHeight: 16,
  },

  invSeat: {
    background: "#fef3c7",
  },

  proSeat: {
    background: "#dbeafe",
  },
};