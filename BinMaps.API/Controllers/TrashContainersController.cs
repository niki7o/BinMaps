using BinMaps.Data.Entities;
using BinMaps.Data.Entities.Enums;
using BinMaps.Infrastructure.Repository;
using Microsoft.AspNetCore.Mvc;

namespace BinMaps.API.Controllers
{
    [ApiController]
    [Route("api/containers")]
    public class TrashContainersController : Controller
    {
        private readonly IRepository<TrashContainer, int> _repo;

        public TrashContainersController(IRepository<TrashContainer, int> repo)
        {
            _repo = repo;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var containers = await _repo.GetAllAsync();

            return Ok(containers.Select(c => new
            {
                c.Id,

                c.LocationX,
                c.LocationY,
                c.TrashType,
                c.HasSensor,
                c.FillPercentage,
                c.Status,
                c.AreaId
            }));
        }
        [HttpPut("{id}/empty")]
        public async Task<IActionResult> EmptyContainer(int id)
        {
            var container = await _repo.GetByIdAsync(id);
            if (container == null)
                return NotFound(new { error = "Контейнер не е намерен" });

           
            container.FillPercentage = 0;

           
            if (container.HasSensor)
            {
                container.Temperature = 15;
            }

            await _repo.UpdateAsync(container);

            return Ok(new
            {
                message = "Контейнерът е изпразнен",
                containerId = id,
                newFillPercentage = 0
            });
        }


        [HttpPut("{id}/update-from-report")]
        public async Task<IActionResult> UpdateFromReport(int id, [FromBody] ReportUpdateDto dto)
        {
            var container = await _repo.GetByIdAsync(id);
            if (container == null)
                return NotFound();

           
            switch (dto.ReportType)
            {
                case "Full":
                    container.FillPercentage = Math.Max(container.FillPercentage, 90);
                    break;
                case "Fire":
                    container.Status = TrashContainerStatus.Fire;
                    if (container.HasSensor)
                        container.Temperature = 60;
                    break;
                case "SensorBroken":
                    container.HasSensor = false;
                    container.Temperature = null;
                    break;
                case "ContainerDamage":
                    container.Status = TrashContainerStatus.Offline;
                    break;
            }

            await _repo.UpdateAsync(container);

            return Ok(new
            {
                message = "Контейнерът е актуализиран",
                container = new
                {
                    container.Id,
                    container.FillPercentage,
                    container.Status,
                    container.Temperature
                }
            });
        }

       
        public class ReportUpdateDto
        {
            public string ReportType { get; set; }
        }
    }
}
