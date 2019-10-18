#!/usr/bin/env perl
package CATUNIQ;
our $VERSION = "0.1.2";
eval $VERSION;
# 2019-07-31T12:30

use strict;
use warnings; no warnings 'experimental';
use v5.16;

use File::Spec;			# Portably perform operations on file names
use File::Path;			# Create or remove directory trees
use File::Slurp;		# Simple and Efficient Reading/Writing/Modifying of Complete Files
use File::Copy;			# Copy files or filehandles
use List::Util 'uniqstr';	# A selection of general-utility list subroutines
use OptArgs2;			# Integrated argument and option processing
use Data::Printer;		# colored pretty-print of Perl data structures and objects


my @valid_accts = (qw'
    6815
    6831
    6151'
);

my @valid_years = (qw'
    2016
    2017
    2018
    2019'
);


# ESTABLISH THE CL OPTIONS AND ARGUMENTS
opt help => (
    isa => 'Flag',
    comment => 'Help',
    alias => 'h',
    ishelp => 1,
);

arg acct => (
    isa     => 'Str',
    comment => 'The name of the account to which the file is related; e.g. "usb_6815" or "usb_6831"',
    required=> 1,
);

opt dest => (
    isa     => 'Str',
    alias   => 'd',
    comment => 'path to the destination file upon which the new data will be catenated.',
    default => exists $ENV{WORKUSB} ? $ENV{WORKUSB} : undef,
);

opt restore => (
    comment => 'Restore a backed-up file related to <ACCT>',
    isa     => 'Flag',
    alias   => 'r',
);

# PROCESS THE CL OPTIONS AND ARGUMENTS
my $opts = optargs;




# VERIFY FILES

# Verify $WORKBAK exists
exists $ENV{WORKBAK} || die("STOP: \$WORKBAK is not defined");

# Verify correct form of 'acct', e.g., 'usb_6815'
my ($acct) = $opts->{acct} =~ /usb_(\d{4})/ or die("STOP: incorrect acct form: $opts->{acct}");
$acct ~~ @valid_accts or die("STOP: acct $acct is not a member of @valid_accts");

# verify a $dest has been supplied
die ("STOP: you did not supply a '-dest' option and \$WORKUSB is not defined.") unless exists $opts->{dest};
my $dest = File::Spec->catdir($opts->{dest}, $opts->{acct}); # e.g., $WORKUSB/usb_6815

if ($opts->{restore}) {
    say "Running restore.";
    restore();
    exit;
}

# Find and verify 'export.csv'
my $export = File::Spec->catfile($ENV{HOME}, 'Downloads', 'export.csv');
-e -r -w $export or die("STOP: $export must exist, be readable, and be writable.");

# Find year from within export.csv
my @lines = read_file($export);
chomp(my $header = shift @lines); # remove the header line from $export
my ($year) = $lines[1] =~ /([[:digit:]]{4})/
    or die("Cannot obtain a year from $export\n");

# verify $dest_year dir exists or create it, including subdirectories
my $dest_year = File::Spec->catdir($dest, $year); # e.g., $WORKUSB/usb_6815/2019
File::Path::make_path($dest_year, {verbose => 1}) unless ( -d $dest_year );

my $acct_year = "$opts->{acct}--${year}.csv";     # e.g., usb_6815--2019.csv
my $dest_file = File::Spec->catfile($dest, $year, $acct_year); # e.g., $WORKUSB/usb_6815/2019/usb_6815--2019.csv




# Backup original $dest_file to $WORKBAK before appending to
my $dest_bak = File::Spec->catfile($ENV{WORKBAK}, "$acct_year." . time());
copy($dest_file, $dest_bak);

# APPEND $export onto $dest_file
append_file($dest_file, @lines)
    or die("STOP: append of $dest_file and \@lines failed.\n");

# UNIQUE new $dest_file
@lines = uniqstr sort map { # first change date to year-mm-dd for proper sorting
    if (/([[:digit:]]{1,2})\/([[:digit:]]{1,2})\/([[:digit:]]{4})/) {
        my $year = sprintf("%4d-%02d-%02d",$3,$1,$2);
        s/$&/$year/;
    }
    $_;
} read_file($dest_file);

unshift @lines, pop @lines; # header ends up last after the sort; put it back to beginning

# Save new $dest_file
write_file($dest_file, @lines);

# Backup export.csv to $WORKBAK
move($export, File::Spec->catfile($ENV{WORKBAK}, "export.${acct_year}." . time()));



say "SUCCESS: $export catuniq'ed onto $dest_file.";

sub restore {
    use POSIX qw(strftime);
    my $acct = $opts->{acct}; # e.g. usb_6815
    my $dt = qr/^(\d{4}-\d{2}-\d{2})/;

    chdir $ENV{WORKBAK};
    opendir (my $dh, '.') || die "Can't open $ENV{WORKBAK}: $!";

    my @baks =
        sort { # sort by most recent backup first
            my ($at) = $a->{t} =~ $dt; # just sort by datetime
            my ($bt) = $b->{t} =~ $dt;
            $bt cmp $at;
        }
        map { # change Unix time to POSIX ISO datetime %Y-%m-%dT%H:%M:%S
            my ($acct, $time) = /^(.*.csv).(\d+)$/;
            $time = substr $time, 0, 10; # remove milliseconds from those times that have them
            my $t = (strftime "%F T %T", localtime($time)) . sprintf(" --- %s", $acct);
            {t => $t, o => $_}; # map to POSIX time, and original filename as a hashref
        }
        grep {/$acct.*.csv/ }
        readdir($dh);

    foreach (@baks) {
        state $c = 0;
        printf("[%2d] %s\n", $c++, $_->{t});
    }

    print "Pick a number: ";
    chomp (my $num = <STDIN>);
    say "You chose $baks[$num]->{t} ($baks[$num]->{o})";
    print "restore (y/n)? ";
    exit unless <STDIN> =~ /y/i;

    my ($file) = $baks[$num]->{t} =~ /--- (.*)$/; # i.e., 'usb_6815--2019.csv'
    my ($year) = $file =~ /(\d{4})\.csv$/; # i.e., '2019'
    my $restore_path = File::Spec->catfile($dest,$year,$file); # full path to file to be restored
    my $bak_path = File::Spec->catfile($ENV{WORKBAK}, $baks[$num]->{o}); # full path to backed-up file

    # back up the file to be restored, just in case; use same directory
    move( ${restore_path}, ${restore_path}.'.bak') or die "Backup of ${restore_path} failed: $!";
    # note that the backed-up file will be deleted
    move( ${bak_path}, ${restore_path}) or die "Restore of $baks[$num]->{o} failed: $!";

    say "Successfully restored $baks[$num]->{o} to $restore_path";
}
