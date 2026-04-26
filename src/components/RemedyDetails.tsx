import materia from "../data/materiaMedica.json";

export default function RemedyDetails({ remedy, onClose }: any) {
  if (!remedy) return null;

  const data: any = (materia as any)[remedy];

  if (!data) {
    return (
      <div style={boxStyle}>
        <button onClick={onClose}>Close</button>
        <p>No data found</p>
      </div>
    );
  }

  return (
    <div style={boxStyle}>
      <button onClick={onClose}>❌ Close</button>

      <h2>{remedy}</h2>

      <h4>Symptoms</h4>
      <ul>
        {data.symptoms?.map((s: string, i: number) => (
          <li key={i}>{s}</li>
        ))}
      </ul>

      <h4>Mind</h4>
      <ul>
        {data.mind?.map((s: string, i: number) => (
          <li key={i}>{s}</li>
        ))}
      </ul>

      <h4>Keynotes</h4>
      <ul>
        {data.keynotes?.map((s: string, i: number) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

const boxStyle: any = {
  position: "fixed",
  top: 40,
  right: 40,
  width: 350,
  height: 450,
  overflow: "auto",
  background: "#fff",
  border: "1px solid #ccc",
  padding: 15,
  zIndex: 1000
};