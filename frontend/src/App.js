import { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    axios
      .get("/api/matches")
      .then((res) => setMatches(res.data))
      .catch((err) => console.error(err));
  }, []);

  return (
    <div>
      <h1>Live Matches</h1>

      {matches.map((m, i) => (
        <div key={i}>
          <h3>
            {m.team1} vs {m.team2}
          </h3>
          <p>{m.score}</p>
          <p>{m.status}</p>
        </div>
      ))}
    </div>
  );
}

export default App;
