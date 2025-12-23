import { query } from '../config/database';

// ============================================
// SUN CALCULATOR SERVICE
// Calcola alba e tramonto basandosi su coordinate GPS
// ============================================

interface SunTimes {
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
  civilDawn: Date;      // Alba civile (sole 6° sotto orizzonte)
  civilDusk: Date;      // Tramonto civile
  goldenHourStart: Date; // Ora dorata mattina
  goldenHourEnd: Date;   // Ora dorata sera
}

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calcola l'ora solare basata sulle coordinate e la data
 * Algoritmo basato su NOAA Solar Calculator
 */
export const calculateSunTimes = (coords: Coordinates, date: Date = new Date()): SunTimes => {
  const { latitude, longitude } = coords;

  // Converti data in Julian Date
  const julianDate = toJulianDate(date);
  const julianCentury = (julianDate - 2451545) / 36525;

  // Calcola equazione del tempo e declinazione solare
  const geomMeanLongSun = (280.46646 + julianCentury * (36000.76983 + 0.0003032 * julianCentury)) % 360;
  const geomMeanAnomSun = 357.52911 + julianCentury * (35999.05029 - 0.0001537 * julianCentury);
  const eccentEarthOrbit = 0.016708634 - julianCentury * (0.000042037 + 0.0000001267 * julianCentury);
  const sunEqOfCtr = Math.sin(degToRad(geomMeanAnomSun)) * (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury)) +
    Math.sin(degToRad(2 * geomMeanAnomSun)) * (0.019993 - 0.000101 * julianCentury) +
    Math.sin(degToRad(3 * geomMeanAnomSun)) * 0.000289;

  const sunTrueLong = geomMeanLongSun + sunEqOfCtr;
  const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(degToRad(125.04 - 1934.136 * julianCentury));
  const meanObliqEcliptic = 23 + (26 + ((21.448 - julianCentury * (46.815 + julianCentury * (0.00059 - julianCentury * 0.001813)))) / 60) / 60;
  const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos(degToRad(125.04 - 1934.136 * julianCentury));
  const sunDeclin = radToDeg(Math.asin(Math.sin(degToRad(obliqCorr)) * Math.sin(degToRad(sunAppLong))));

  const varY = Math.tan(degToRad(obliqCorr / 2)) * Math.tan(degToRad(obliqCorr / 2));
  const eqOfTime = 4 * radToDeg(
    varY * Math.sin(2 * degToRad(geomMeanLongSun)) -
    2 * eccentEarthOrbit * Math.sin(degToRad(geomMeanAnomSun)) +
    4 * eccentEarthOrbit * varY * Math.sin(degToRad(geomMeanAnomSun)) * Math.cos(2 * degToRad(geomMeanLongSun)) -
    0.5 * varY * varY * Math.sin(4 * degToRad(geomMeanLongSun)) -
    1.25 * eccentEarthOrbit * eccentEarthOrbit * Math.sin(2 * degToRad(geomMeanAnomSun))
  );

  // Calcola mezzogiorno solare
  const solarNoonMinutes = 720 - 4 * longitude - eqOfTime;

  // Calcola angolo orario per diversi gradi sotto l'orizzonte
  const haOfficial = calculateHourAngle(latitude, sunDeclin, -0.833);    // Ufficiale
  const haCivil = calculateHourAngle(latitude, sunDeclin, -6);           // Alba/tramonto civile
  const haGolden = calculateHourAngle(latitude, sunDeclin, 6);           // Golden hour

  // Converti in orari locali
  const timezone = -date.getTimezoneOffset() / 60;

  const createTime = (minutes: number): Date => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    result.setMinutes(minutes);
    return result;
  };

  return {
    sunrise: createTime(solarNoonMinutes - haOfficial * 4),
    sunset: createTime(solarNoonMinutes + haOfficial * 4),
    solarNoon: createTime(solarNoonMinutes),
    civilDawn: createTime(solarNoonMinutes - haCivil * 4),
    civilDusk: createTime(solarNoonMinutes + haCivil * 4),
    goldenHourStart: createTime(solarNoonMinutes - haGolden * 4),
    goldenHourEnd: createTime(solarNoonMinutes + haGolden * 4),
  };
};

/**
 * Calcola l'angolo orario
 */
const calculateHourAngle = (latitude: number, declination: number, zenith: number): number => {
  const latRad = degToRad(latitude);
  const decRad = degToRad(declination);
  const zenRad = degToRad(90 - zenith);

  let cosHA = (Math.cos(zenRad) - Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad));

  // Clamp per evitare NaN alle latitudini estreme
  cosHA = Math.max(-1, Math.min(1, cosHA));

  return radToDeg(Math.acos(cosHA));
};

/**
 * Converti gradi in radianti
 */
const degToRad = (deg: number): number => (Math.PI / 180) * deg;

/**
 * Converti radianti in gradi
 */
const radToDeg = (rad: number): number => (180 / Math.PI) * rad;

/**
 * Converti data in Julian Date
 */
const toJulianDate = (date: Date): number => {
  return date.getTime() / 86400000 + 2440587.5;
};

/**
 * Formatta ora come HH:mm
 */
export const formatTime = (date: Date): string => {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

/**
 * Ottieni coordinate GPS di un impianto
 */
export const getImpiantoCoordinates = async (impiantoId: number): Promise<Coordinates | null> => {
  try {
    const [result]: any = await query(
      'SELECT latitudine, longitudine FROM impianti WHERE id = ?',
      [impiantoId]
    );

    if (result.length === 0 || !result[0].latitudine || !result[0].longitudine) {
      return null;
    }

    return {
      latitude: parseFloat(result[0].latitudine),
      longitude: parseFloat(result[0].longitudine)
    };
  } catch (error) {
    console.error('Errore recupero coordinate impianto:', error);
    return null;
  }
};

/**
 * Ottieni orari alba/tramonto per un impianto specifico
 */
export const getSunTimesForImpianto = async (impiantoId: number, date?: Date): Promise<SunTimes | null> => {
  const coords = await getImpiantoCoordinates(impiantoId);

  if (!coords) {
    console.warn(`Coordinate GPS non disponibili per impianto ${impiantoId}`);
    return null;
  }

  return calculateSunTimes(coords, date || new Date());
};

/**
 * Verifica se siamo in un certo periodo rispetto ad alba/tramonto
 */
export const isSunConditionMet = (
  sunTimes: SunTimes,
  condition: 'sunrise' | 'sunset' | 'day' | 'night' | 'golden_hour',
  offset: number = 0 // minuti di offset
): boolean => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const toMinutes = (d: Date): number => d.getHours() * 60 + d.getMinutes();

  switch (condition) {
    case 'sunrise': {
      const sunriseMinutes = toMinutes(sunTimes.sunrise) + offset;
      return Math.abs(currentMinutes - sunriseMinutes) <= 5; // ±5 minuti
    }
    case 'sunset': {
      const sunsetMinutes = toMinutes(sunTimes.sunset) + offset;
      return Math.abs(currentMinutes - sunsetMinutes) <= 5; // ±5 minuti
    }
    case 'day': {
      const sunriseMinutes = toMinutes(sunTimes.sunrise);
      const sunsetMinutes = toMinutes(sunTimes.sunset);
      return currentMinutes >= sunriseMinutes && currentMinutes <= sunsetMinutes;
    }
    case 'night': {
      const sunriseMinutes = toMinutes(sunTimes.sunrise);
      const sunsetMinutes = toMinutes(sunTimes.sunset);
      return currentMinutes < sunriseMinutes || currentMinutes > sunsetMinutes;
    }
    case 'golden_hour': {
      const goldenStartMinutes = toMinutes(sunTimes.goldenHourStart);
      const goldenEndMinutes = toMinutes(sunTimes.goldenHourEnd);
      const sunriseMinutes = toMinutes(sunTimes.sunrise);
      const sunsetMinutes = toMinutes(sunTimes.sunset);
      // Golden hour mattina o sera
      return (currentMinutes >= sunriseMinutes && currentMinutes <= goldenStartMinutes) ||
             (currentMinutes >= goldenEndMinutes && currentMinutes <= sunsetMinutes);
    }
    default:
      return false;
  }
};

/**
 * Calcola i prossimi orari di alba/tramonto per i prossimi N giorni
 */
export const getUpcomingSunTimes = async (
  impiantoId: number,
  days: number = 7
): Promise<Array<{ date: string; sunrise: string; sunset: string }>> => {
  const coords = await getImpiantoCoordinates(impiantoId);
  if (!coords) return [];

  const result = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    const sunTimes = calculateSunTimes(coords, date);

    result.push({
      date: date.toISOString().split('T')[0],
      sunrise: formatTime(sunTimes.sunrise),
      sunset: formatTime(sunTimes.sunset)
    });
  }

  return result;
};

export default {
  calculateSunTimes,
  getSunTimesForImpianto,
  isSunConditionMet,
  getUpcomingSunTimes,
  formatTime
};
