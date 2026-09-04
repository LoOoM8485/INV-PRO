import React, { useEffect, useMemo, useRef, useState } from "react";
import { db } from "./firebase";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";

const TABLES = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15];
const SEATS = [1, 2, 3, 5, 6, 7, 8, 9];

const INV_IDS = Array.from({ length: 56 }, (_, i) => i * 2 + 1);
const PRO_IDS = Array.from({ length: 56 }, (_, i) => i * 2 + 2);

const DOC_REF = doc(db, "planner", "main");

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
    customBlocks: [
      { a: "", b: "" },
      { a: "", b: "" },
      { a: "", b: "" },
    ],
  };
}

function mergeSavedState(data) {
  const base = createInitialState();

  return {
    ...base,
    ...data,
    inv: data?.inv || base.inv,
    pro: data?.pro || base.pro,
    customBlocks: data?.customBlocks || base.customBlocks,
  };
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

function getBlockedIdsForPlayer(id, customBlocks) {
  const blocked = new Set([getPairId(id)]);

  customBlocks.forEach((block) => {
    const a = Number(block.a);
    const b = Number(block.b);

    if (!a || !b) return;

    if (Number(id) === a) blocked.add(b);
    if (Number(id) === b) blocked.add(a);
  });

  return Array.from(blocked);
}

function getBlockedTablesForPlayer(id, playerById, customBlocks) {
  const blockedIds = getBlockedIdsForPlayer(id, customBlocks);
  const tables = [];

  blockedIds.forEach((blockedId) => {
    const player = playerById.get(Number(blockedId));

    if (player && playerHasSeat(player)) {
      tables.push(Number(player.table));
    }
  });

  return Array.from(new Set(tables)).sort((a, b) => a - b);
}

export default function App() {
  const [state, setState] = useState(createInitialState());
  const [loaded, setLoaded] = useState(false);
  const screen = useScreenSize();
  const latestStateRef = useRef(state);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  function setSyncBadge(mode) {
  let badge = document.getElementById("sync-mode-badge");

  if (!badge) {
    badge = document.createElement("div");
    badge.id = "sync-mode-badge";
    document.body.appendChild(badge);
    Object.assign(badge.style, {
      position: "fixed",
      right: "12px",
      bottom: "12px",
      zIndex: "9999",
      padding: "7px 10px",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,.18)",
      background: "rgba(7,9,13,.92)",
      backdropFilter: "blur(10px)",
      boxShadow: "0 8px 24px rgba(0,0,0,.32)",
      fontFamily: "system-ui, sans-serif",
      fontSize: "9px",
      fontWeight: "900",
      letterSpacing: ".08em",
      pointerEvents: "none",
    });
  }

  badge.dataset.mode = mode;
  badge.textContent =
    mode === "live"
      ? "● LIVE SYNC"
      : mode === "local"
      ? "● LOCAL MODE"
      : "● CONNECTING";
  badge.style.color =
    mode === "live" ? "#86efac" : mode === "local" ? "#f0d98a" : "#cbd5e1";
  badge.style.borderColor =
    mode === "live"
      ? "rgba(34,197,94,.45)"
      : mode === "local"
      ? "rgba(215,184,91,.45)"
      : "rgba(148,163,184,.35)";
}

useEffect(() => {
  let unsubscribe;
  let cancelled = false;
  let hasRemoteData = false;

  function loadLocal() {
    try {
      const saved = localStorage.getItem("inv-pro-planner-state-v1");
      const localState = saved
        ? mergeSavedState(JSON.parse(saved))
        : createInitialState();

      if (!cancelled) {
        latestStateRef.current = localState;
        setState(localState);
        setLoaded(true);
        setSyncBadge("local");
      }
    } catch (error) {
      console.warn("Local planner state could not be loaded.", error);
      if (!cancelled) {
        const fallback = createInitialState();
        latestStateRef.current = fallback;
        setState(fallback);
        setLoaded(true);
        setSyncBadge("local");
      }
    }
  }

  async function initFirebase() {
    setSyncBadge("connecting");

    try {
      const snap = await getDoc(DOC_REF);

      if (!snap.exists()) {
        await setDoc(DOC_REF, createInitialState());
      }

      unsubscribe = onSnapshot(
        DOC_REF,
        (snapshot) => {
          if (snapshot.exists()) {
            const firebaseData = mergeSavedState(snapshot.data());
            hasRemoteData = true;
            latestStateRef.current = firebaseData;
            setState(firebaseData);
            setLoaded(true);
            setSyncBadge("live");

            try {
              localStorage.setItem(
                "inv-pro-planner-state-v1",
                JSON.stringify(firebaseData)
              );
            } catch {}
          }
        },
        (error) => {
          console.warn("Firebase sync unavailable; using local mode.", error);
          if (!hasRemoteData) loadLocal();
          else setSyncBadge("local");
        }
      );
    } catch (error) {
      console.warn("Firebase unavailable; using local mode.", error);
      loadLocal();
    }
  }

  initFirebase();

  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}, []);

async function saveState(newState) {
  latestStateRef.current = newState;
  setState(newState);

  try {
    localStorage.setItem(
      "inv-pro-planner-state-v1",
      JSON.stringify(newState)
    );
  } catch {}

  try {
    await setDoc(DOC_REF, newState);
    setSyncBadge("live");
  } catch (error) {
    console.warn("Firebase write unavailable; saved locally instead.", error);
    setSyncBadge("local");
  }
}

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

  const inPlayIds = livePlayers
    .map((player) => player.id)
    .sort((a, b) => a - b);

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
    const current = latestStateRef.current;
    const key = type === "INV" ? "inv" : "pro";

    const newState = {
      ...current,
      [key]: current[key].map((player) =>
        player.id === id ? { ...player, ...patch } : player
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
    if (!player) return;

    updatePlayer(type, id, {
      eliminated: !player.eliminated,
      table: !player.eliminated ? "" : player.table,
      seat: !player.eliminated ? "" : player.seat,
    });
  }

  function getUnavailableTablesForPlayer(id) {
    return getBlockedTablesForPlayer(
      id,
      playerById,
      state.customBlocks || []
    );
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
    saveState({
      ...latestStateRef.current,
      visibleMaxTable: value,
    });
  }

  function updateCustomBlock(index, field, value) {
    const current = latestStateRef.current;
    const blocks = [...(current.customBlocks || createInitialState().customBlocks)];

    blocks[index] = {
      ...blocks[index],
      [field]: value,
    };

    if (blocks[index].a && blocks[index].b && blocks[index].a === blocks[index].b) {
      alert("A player cannot be blocked with themselves.");
      return;
    }

    saveState({
      ...current,
      customBlocks: blocks,
    });
  }

  function undoBreak() {
    if (!state.lastBreakSnapshot) {
      alert("No table break to undo.");
      return;
    }

    if (!window.confirm("Undo the last table break?")) return;

    saveState({
      ...state.lastBreakSnapshot,
      lastBreakSnapshot: null,
    });
  }

  function rotateTable(table) {
    if (!window.confirm(`Confirm rotation of Table ${table}?`)) return;

    const current = latestStateRef.current;
    const currentAllPlayers = [...current.inv, ...current.pro];

    const seatOccupants = new Map();

    currentAllPlayers.forEach((player) => {
      if (
        Number(player.table) === Number(table) &&
        player.seat !== "" &&
        !player.eliminated
      ) {
        seatOccupants.set(Number(player.seat), player.id);
      }
    });

    if (seatOccupants.size === 0) {
      alert(`Table ${table} has no players to rotate.`);
      return;
    }

    const newSeatByPlayerId = new Map();

    SEATS.forEach((seat, index) => {
      const previousSeat = SEATS[index - 1] || SEATS[SEATS.length - 1];
      const playerIdFromPreviousSeat = seatOccupants.get(previousSeat);

      if (playerIdFromPreviousSeat) {
        newSeatByPlayerId.set(playerIdFromPreviousSeat, String(seat));
      }
    });

    const newState = {
      ...current,
      inv: current.inv.map((player) =>
        newSeatByPlayerId.has(player.id)
          ? { ...player, seat: newSeatByPlayerId.get(player.id) }
          : player
      ),
      pro: current.pro.map((player) =>
        newSeatByPlayerId.has(player.id)
          ? { ...player, seat: newSeatByPlayerId.get(player.id) }
          : player
      ),
    };

    saveState(newState);
  }

  function findRandomBreakAssignments({
    breakingPlayers,
    lowerTables,
    currentOccupied,
    playerById,
    breakingTable,
    customBlocks,
  }) {
    const breakingIds = new Set(breakingPlayers.map((p) => p.id));

    function getBlockedTables(player, assignments) {
      const blockedIds = getBlockedIdsForPlayer(player.id, customBlocks);
      const blockedTables = [];

      blockedIds.forEach((blockedId) => {
        if (assignments.has(Number(blockedId))) {
          blockedTables.push(Number(assignments.get(Number(blockedId)).table));
          return;
        }

        const blockedPlayer = playerById.get(Number(blockedId));

        if (
          blockedPlayer &&
          playerHasSeat(blockedPlayer) &&
          !breakingIds.has(blockedPlayer.id) &&
          Number(blockedPlayer.table) !== Number(breakingTable)
        ) {
          blockedTables.push(Number(blockedPlayer.table));
        }
      });

      return new Set(blockedTables);
    }

    function getCandidates(player, occupied, assignments) {
      const blockedTables = getBlockedTables(player, assignments);
      const candidates = [];

      for (const table of cryptoShuffle(lowerTables)) {
        if (blockedTables.has(Number(table))) continue;

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

    const current = latestStateRef.current;
    const currentAllPlayers = [...current.inv, ...current.pro];

    const breakingPlayers = currentAllPlayers.filter(
      (player) =>
        Number(player.table) === Number(highestTableInPlay) &&
        player.seat !== "" &&
        !player.eliminated
    );

    const lowerTables = TABLES.filter(
      (table) => Number(table) < Number(highestTableInPlay)
    );

    const currentOccupied = new Map();

    currentAllPlayers.forEach((player) => {
      if (playerHasSeat(player)) {
        currentOccupied.set(`${player.table}-${player.seat}`, player.id);
      }
    });

    breakingPlayers.forEach((player) => {
      currentOccupied.delete(`${player.table}-${player.seat}`);
    });

    const currentPlayerById = new Map();
    currentAllPlayers.forEach((player) => currentPlayerById.set(player.id, player));

    const assignments = findRandomBreakAssignments({
      breakingPlayers,
      lowerTables,
      currentOccupied,
      playerById: currentPlayerById,
      breakingTable: highestTableInPlay,
      customBlocks: current.customBlocks || [],
    });

    if (!assignments) {
      alert(
        `Cannot break Table ${highestTableInPlay}. Not enough legal seats available.`
      );
      return;
    }

    const summaryLines = breakingPlayers
      .slice()
      .sort((a, b) => Number(a.seat) - Number(b.seat))
      .map((player) => {
        const destination = assignments.get(player.id);
        return `Seat${player.seat} - ID ${player.id} - T${destination.table} S${destination.seat}`;
      });

    alert(`Table ${highestTableInPlay} break:\n\n${summaryLines.join("\n")}`);

    const snapshotBeforeBreak = JSON.parse(JSON.stringify(current));

    const newState = {
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
    };

    saveState(newState);
  }

  const styles = makeStyles(screen);

  if (!loaded) {
    return (
      <div style={{ padding: 30, fontFamily: "Arial", fontWeight: 900 }}>
        Loading planner...
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.app}>
        <header style={styles.header}>
          <div style={styles.logoBox}>
            <img src="/logo.png" alt="Logo" style={styles.logo} />
            <h1 style={styles.title}>INV / PRO TABLE PLANNER</h1>
          </div>

          <div style={styles.topMenu}>
            <div style={styles.customBlocksBox}>
              <div style={styles.customBlocksTitle}>EXTRA BLOCKS</div>

              {(state.customBlocks || createInitialState().customBlocks).map(
                (block, index) => (
                  <div key={index} style={styles.customBlockRow}>
                    <PlayerSelect
                      value={block.a}
                      otherValue={block.b}
                      inPlayIds={inPlayIds}
                      onChange={(value) => updateCustomBlock(index, "a", value)}
                      styles={styles}
                    />

                    <span style={styles.vsText}>×</span>

                    <PlayerSelect
                      value={block.b}
                      otherValue={block.a}
                      inPlayIds={inPlayIds}
                      onChange={(value) => updateCustomBlock(index, "b", value)}
                      styles={styles}
                    />
                  </div>
                )
              )}
            </div>

            <div style={styles.countBox}>
              <button onClick={undoBreak} style={styles.undoButton}>
                UNDO
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
                  playerById={playerById}
                  customBlocks={state.customBlocks || []}
                  onRotate={rotateTable}
                  styles={styles}
                />
              ))}
            </div>
          </section>

          <section style={styles.playerLists}>
            <div style={styles.sharedScrollArea}>
              <div style={styles.playerListsInner}>
                <PlayerList
                  title="INV"
                  players={state.inv}
                  allPlayers={allPlayers}
                  allowedTables={visibleTables}
                  updateTable={setPlayerTable}
                  updateSeat={setPlayerSeat}
                  toggleEliminated={toggleEliminated}
                  getUnavailableTablesForPlayer={getUnavailableTablesForPlayer}
                  getAvailableSeatsForPlayer={getAvailableSeatsForPlayer}
                  styles={styles}
                />

                <PlayerList
                  title="PRO"
                  players={state.pro}
                  allPlayers={allPlayers}
                  allowedTables={visibleTables}
                  updateTable={setPlayerTable}
                  updateSeat={setPlayerSeat}
                  toggleEliminated={toggleEliminated}
                  getUnavailableTablesForPlayer={getUnavailableTablesForPlayer}
                  getAvailableSeatsForPlayer={getAvailableSeatsForPlayer}
                  styles={styles}
                />
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function PlayerSelect({ value, otherValue, inPlayIds, onChange, styles }) {
  const options = Array.from(
    new Set([
      ...inPlayIds,
      value ? Number(value) : null,
      otherValue ? Number(otherValue) : null,
    ].filter(Boolean))
  ).sort((a, b) => a - b);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={styles.customSelect}
    >
      <option value="">-</option>

      {options.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  );
}

function TableCard({
  table,
  allPlayers,
  playerById,
  customBlocks,
  onRotate,
  styles,
}) {
  const tableHasPlayers = allPlayers.some(
    (player) =>
      Number(player.table) === Number(table) &&
      player.seat !== "" &&
      !player.eliminated
  );

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
      <div style={styles.tableCardTitle}>
        <span>T{table}</span>

        {tableHasPlayers ? (
          <button onClick={() => onRotate(table)} style={styles.rotateButton}>
            ROT
          </button>
        ) : null}
      </div>

      <div style={styles.seatGrid}>
        {seats.map(({ seat, player }) => {
          const blockedTables = player
            ? getBlockedTablesForPlayer(player.id, playerById, customBlocks)
            : [];

          return (
            <div key={seat} style={styles.seatBox}>
              <div style={styles.seatNumber}>
                <span>S{seat}</span>

                {blockedTables.length > 0 ? (
                  <span style={styles.pairWarning}>{blockedTables.join(",")}</span>
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
          );
        })}
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
  getUnavailableTablesForPlayer,
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

      {players.map((player) => {
        const blockedTables = getUnavailableTablesForPlayer(player.id);
        const availableSeats = getAvailableSeatsForPlayer(player);

        const tableOptions = allowedTables.filter((table) => {
          if (blockedTables.includes(Number(table))) return false;

          if (Number(player.table) === Number(table)) return true;

          const hasFreeSeat = SEATS.some((seat) => {
            const occupiedBySomeoneElse = allPlayers.some(
              (p) =>
                p.id !== player.id &&
                Number(p.table) === Number(table) &&
                Number(p.seat) === Number(seat) &&
                !p.eliminated
            );

            return !occupiedBySomeoneElse;
          });

          return hasFreeSeat;
        });

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
              {blockedTables.length > 0 ? (
                <span style={styles.blockedTable}>
                  {blockedTables.map((table) => `T${table}`).join(" ")}
                </span>
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
    </section>
  );
}

function makeStyles(screen) {
  const overviewWidth = Math.max(170, Math.min(300, Math.round(screen.width * 0.24)));

  const invProColumnWidth = 186;
  const listsGap = 6;
  const listsWidth = invProColumnWidth * 2 + listsGap;

  return {
    page: {
      minHeight: "100vh",
      background: "#e5e7eb",
      padding: 6,
      boxSizing: "border-box",
      fontFamily: "Arial, Helvetica, sans-serif",
      overflowX: "auto",
    },

    app: {
      width: overviewWidth + listsWidth + 34,
      minWidth: overviewWidth + listsWidth + 34,
      maxWidth: "none",
      margin: "0 auto",
      background: "white",
      borderRadius: 12,
      padding: 8,
      boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
    },

    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },

    logoBox: {
      textAlign: "center",
      flex: 1,
    },

    logo: {
      height: 50,
      maxWidth: 170,
      objectFit: "contain",
    },

    title: {
      margin: 0,
      fontSize: 14,
      fontWeight: 900,
      color: "#111827",
    },

    topMenu: {
      display: "flex",
      alignItems: "center",
      gap: 6,
    },

    customBlocksBox: {
      border: "2px solid #111827",
      borderRadius: 7,
      padding: 3,
      background: "#f8fafc",
    },

    customBlocksTitle: {
      fontSize: 7,
      fontWeight: 900,
      textAlign: "center",
      marginBottom: 2,
    },

    customBlockRow: {
      display: "flex",
      alignItems: "center",
      gap: 2,
      marginBottom: 2,
    },

    customSelect: {
      width: 42,
      height: 18,
      fontSize: 9,
      fontWeight: 900,
      borderRadius: 4,
      border: "1px solid #94a3b8",
    },

    vsText: {
      fontSize: 9,
      fontWeight: 900,
    },

    countBox: {
      display: "flex",
      alignItems: "center",
      gap: 4,
    },

    countCardTotal: {
      border: "2px solid #111827",
      borderRadius: 7,
      minWidth: 42,
      padding: 2,
      textAlign: "center",
      background: "#f8fafc",
    },

    countCardInv: {
      border: "2px solid #d6b94c",
      borderRadius: 7,
      minWidth: 42,
      padding: 2,
      textAlign: "center",
      background: "#fef3c7",
    },

    countCardPro: {
      border: "2px solid #93c5fd",
      borderRadius: 7,
      minWidth: 42,
      padding: 2,
      textAlign: "center",
      background: "#dbeafe",
    },

    countLabel: {
      fontSize: 7,
      fontWeight: 900,
      color: "#475569",
    },

    countValue: {
      fontSize: 15,
      fontWeight: 900,
      color: "#111827",
    },

    undoButton: {
      border: "2px solid #475569",
      background: "#64748b",
      color: "white",
      fontWeight: 900,
      borderRadius: 7,
      padding: "6px 6px",
      fontSize: 9,
      cursor: "pointer",
    },

    breakButton: {
      border: "2px solid #b91c1c",
      background: "#ef4444",
      color: "white",
      fontWeight: 900,
      borderRadius: 7,
      padding: "6px 6px",
      fontSize: 9,
      cursor: "pointer",
    },

    mainGrid: {
      display: "grid",
      gridTemplateColumns: `${overviewWidth}px ${listsWidth}px`,
      gap: 8,
      alignItems: "start",
    },

    tableOverview: {
      border: "2px solid #111827",
      borderRadius: 10,
      padding: 5,
      background: "#f8fafc",
      width: overviewWidth,
      boxSizing: "border-box",
      maxHeight: "calc(100vh - 100px)",
      overflowY: "auto",
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

    playerLists: {
      width: listsWidth,
      minHeight: 0,
    },

    sharedScrollArea: {
      maxHeight: "calc(100vh - 100px)",
      overflowY: "auto",
      borderRadius: 10,
    },

    playerListsInner: {
      display: "grid",
      gridTemplateColumns: `${invProColumnWidth}px ${invProColumnWidth}px`,
      gap: listsGap,
      alignItems: "start",
    },

    sectionTitle: {
      margin: 0,
      textAlign: "center",
      fontSize: 11,
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
      padding: "2px 3px",
      fontSize: 10,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },

    rotateButton: {
      background: "#facc15",
      border: "0",
      borderRadius: 4,
      fontSize: 7,
      fontWeight: 900,
      padding: "1px 3px",
      cursor: "pointer",
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
      border: "2px solid #111827",
      borderRadius: 9,
      padding: 3,
      background: "#f8fafc",
      width: invProColumnWidth,
      boxSizing: "border-box",
    },

    playerHeader: {
      display: "grid",
      gridTemplateColumns: "25px 34px 39px 39px 24px",
      gap: 2,
      background: "#334155",
      color: "white",
      fontSize: 8,
      fontWeight: 900,
      textAlign: "center",
      padding: 2,
      borderRadius: 5,
      marginBottom: 2,
      position: "sticky",
      top: 0,
      zIndex: 3,
    },

    playerRow: {
      display: "grid",
      gridTemplateColumns: "25px 34px 39px 39px 24px",
      gap: 2,
      background: "#cbd5e1",
      padding: 2,
      borderRadius: 5,
      marginBottom: 2,
      alignItems: "center",
    },

    eliminatedRow: {
      opacity: 0.45,
    },

    idCell: {
      background: "white",
      borderRadius: 4,
      textAlign: "center",
      fontSize: 9,
      fontWeight: 900,
      padding: "3px 0",
    },

    noCell: {
      background: "white",
      borderRadius: 4,
      textAlign: "center",
      fontSize: 7,
      fontWeight: 900,
      padding: "3px 0",
    },

    blockedTable: {
      background: "#ef4444",
      color: "white",
      padding: "1px 2px",
      borderRadius: 4,
    },

    okTable: {
      color: "#15803d",
    },

    tableSelect: {
      width: "100%",
      minHeight: 20,
      borderRadius: 4,
      border: "1px solid #94a3b8",
      background: "white",
      color: "#000",
      fontWeight: 900,
      textAlign: "center",
      fontSize: 10,
    },

    seatSelect: {
      width: "100%",
      minHeight: 20,
      borderRadius: 4,
      border: "1px solid #d6b94c",
      background: "#fef3c7",
      color: "#000",
      fontWeight: 900,
      textAlign: "center",
      fontSize: 10,
    },

    checkbox: {
      width: 15,
      height: 15,
      margin: "0 auto",
    },
  };
}