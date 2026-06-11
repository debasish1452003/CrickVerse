import { useNavigate } from "react-router-dom";

const MatchCard = ({ match }) => {
    const navigate = useNavigate();

    // 🔥 Correct structure (from your DB)
    const team1 = match?.teams?.[0];
    const team2 = match?.teams?.[1];

    if (!match || !team1 || !team2) return null;

    const handleClick = () => {
        navigate(`/match/${match.matchId}`);
    };

    return (
        <div className="match-card" onClick={handleClick}>
            <div className="match-header">
                <span className="series-name">
                    {match.season || "Unknown Series"}
                </span>
                <span className="match-title">
                    {match.title || "Match"}
                </span>
            </div>

            <div className="match-body">
                <div className="team-row">
                    <span className="team-name">{team1.name}</span>
                    <span className="team-score">
                        {team1.score || "Yet to bat"}
                    </span>
                </div>

                <div className="team-row">
                    <span className="team-name">{team2.name}</span>
                    <span className="team-score">
                        {team2.score || "Yet to bat"}
                    </span>
                </div>
            </div>

            <div className="match-footer">
                <span className="match-status">
                    {match.result?.status || "Upcoming"}
                </span>
            </div>
        </div>
    );
};

export default MatchCard;