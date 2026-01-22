using BinMaps.Data.Entities.Enums;
using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;

namespace BinMaps.Shared.DTOs
{

    public class CreateReportDTO
    {
        [Required]
        public int TrashContainerId { get; set; }

        [Required]
        public ReportType ReportType { get; set; }

        public IFormFile? Photo { get; set; }
    }   
}
