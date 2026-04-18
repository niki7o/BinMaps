namespace BinMaps.Data.Entities.Enums
{
    public enum ReportType
    {
        //for all
        Full,
        Fire,
        SensorBroken,


        //for the driver
        TruckProblem,
        ContainerDamage,

        // for the citizen (User/Driver) — suggests a NEW container placement.
        // No TrashContainerId; LocationX/Y on the Report are required.
        // Does not run AI image scoring; always goes to admin review.
        MissingContainer,
    }
}
