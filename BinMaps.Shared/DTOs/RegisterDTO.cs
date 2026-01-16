using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public class RegisterDTO
    {
       
            [Required]
        [StringLength(50, MinimumLength = 3)]
        public string UserName { get; set; }

            [Required]
            [EmailAddress]

            public string Email { get; set; }

            [Length(12, 13)]
            public string? PhoneNumber { get; set; }
            [Required]
            public string Password { get; set; }

            public bool AcceptTerms { get; set; }
        
    }
}
