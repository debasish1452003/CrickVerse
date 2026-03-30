import React from 'react';

const MatchCard = ({ match }) => {
    // Safe fallback just in case data is malformed
    if (!match || !match.team1 || !match.team2) return null;

    return (
        <div className="match-card">
            <div className="match-header">
                <span className="series-name">{match.seriesName}</span>
                <span className="match-title">{match.matchTitle}</span>
            </div>

            <div className="match-body">
                <div className="team-row">
                    <span className="team-name">{match.team1.name}</span>
                    <span className="team-score">{match.team1.score || "Yet to bat"}</span>
                </div>

                <div className="team-row">
                    <span className="team-name">{match.team2.name}</span>
                    <span className="team-score">{match.team2.score || "Yet to bat"}</span>
                </div>
            </div>

            <div className="match-footer">
                <span className="match-status">{match.status}</span>
            </div>
        </div>
    );
};

export default MatchCard;