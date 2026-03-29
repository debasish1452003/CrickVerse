import axios from "axios";
import { useEffect, useState } from "react";
import { div } from "three/tsl";

function App() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    axios
      .get("/api/hello")
      .then((res) => {
        setMsg(res.data.message);
      })
      .catch((err) => console.error(err));
  }, []);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>CrikckVerse</h1>
      <h2>{msg}</h2>
    </div>
  );
}

export default App;
