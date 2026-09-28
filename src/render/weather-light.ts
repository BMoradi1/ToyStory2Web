/** Shared world-light multiplier; kept separate from saved gamma and authored colours. */
export const weatherLight = { value: 1 };
export function setWeatherLight(brightness:number):void { weatherLight.value=brightness/128; }
