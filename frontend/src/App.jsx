import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import Navbar from "./components/Navbar";
import MatchCard from "./components/MatchCard";
import MatchDetail from "./pages/matchDetails";
import "./App.css";

function Home() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = () => {
      axios
        .get("/api/matches")
        .then((res) => {
          // 🔥 IMPORTANT FIX
          setMatches(Array.isArray(res.data.data) ? res.data.data : []);
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/match/:id" element={<MatchDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;