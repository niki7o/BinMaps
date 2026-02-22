export interface ContainerUpdate {
  id:          string;
  fillLevel:   number;
  temperature: number;
  isOnFire:    boolean;
  latitude:    number;
  longitude:   number;
  lastUpdated: string;
}