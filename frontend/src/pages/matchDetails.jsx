import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";

const MatchDetail = () => {
    const { id } = useParams();
    const [match, setMatch] = useState(null);

    useEffect(() => {
        axios.get(`/api/matches/${id}`)
            .then(res => setMatch(res.data.data))
            .catch(err => console.error(err));
    }, [id]);

    if (!match) return <div>Loading...</div>;

    const team1 = match.teams?.[0];
    const team2 = match.teams?.[1];

    return (
        <div>
            <h1>{match.title}</h1>
            <h3>{match.season}</h3>

            <p>{team1?.name} - {team1?.score}</p>
            <p>{team2?.name} - {team2?.score}</p>

            <p>Status: {match.result?.status}</p>
        </div>
    );
};

export default MatchDetail;