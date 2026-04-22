export default async function handler(req, res) {
  const { ids, type } = req.query;
  const url = type === 'taf'
    ? `https://aviationweather.gov/api/data/taf?ids=${ids}&format=raw`
    : `https://aviationweather.gov/api/data/metar?ids=${ids}&format=raw&hours=2`;
  
  try {
    const response = await fetch(url);
    const text = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).send('Error fetching weather data');
  }
}
