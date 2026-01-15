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
            [Range(0, 20)]
            public string UserName { get; set; }

            [Required]
            [EmailAddress]

            public string Email { get; set; }

            [Length(12, 13)]
            public int? PhoneNumber { get; set; }
            [Required]
            public string Password { get; set; }

            public bool AcceptTerms { get; set; }
        
    }
}
