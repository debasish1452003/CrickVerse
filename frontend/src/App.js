import { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    // FIX 1: Point exactly to your Node.js backend port (5000)
    axios
      .get("http://localhost:5000/api/matches")
      .then((res) => {
        console.log("Data received from backend:", res.data); // Helpful for debugging!
        setMatches(res.data);
      })
      .catch((err) => console.error("Axios Error:", err));
  }, []);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Live Cricket Matches</h1>

      {matches.length === 0 ? (
        <p>Loading matches or no matches found...</p>
      ) : (
        matches.map((m, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #ccc",
              margin: "10px 0",
              padding: "15px",
              borderRadius: "8px",
            }}
          >
            {/* FIX 2: Properly access the nested object properties */}
            <h3>
              {m.matchTitle}: {m.team1.name} vs {m.team2.name}
            </h3>

            <p>
              <strong>{m.team1.name}:</strong> {m.team1.score || "Yet to bat"}
            </p>
            <p>
              <strong>{m.team2.name}:</strong> {m.team2.score || "Yet to bat"}
            </p>

            <p style={{ color: "blue", fontWeight: "bold" }}>
              Status: {m.status}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

export default App;
