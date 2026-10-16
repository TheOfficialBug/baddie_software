import { createContext, useContext } from 'react';

/** Organizer draw pages show each entry's skill level next to the name; public pages don't. */
export const ShowLevels = createContext(false);
export const useShowLevels = () => useContext(ShowLevels);
