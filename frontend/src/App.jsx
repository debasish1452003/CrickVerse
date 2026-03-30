import { useEffect, useState } from "react";
import axios from "axios";
import Navbar from "./components/Navbar";
import MatchCard from "./components/MatchCard";
import "./App.css"; // We will create this below

function App() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Polling every 10 seconds to keep scores live
    const fetchMatches = () => {
      axios
        .get("/api/matches") // Ensure URL is correct
        .then((res) => {
          setMatches(res.data);
          setLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setLoading(false);
        });
    };

    fetchMatches();
    const interval = setInterval(fetchMatches, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <Navbar />
      <main className="main-content">
        <h2 className="page-title">Live Scores & Fixtures</h2>

        {loading ? (
          <div className="loader">Loading Live Matches...</div>
        ) : (
          <div className="match-grid">
            {matches.map((match) => (
              <MatchCard key={match.matchId} match={match} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
