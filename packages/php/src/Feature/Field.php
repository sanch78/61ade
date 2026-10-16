<?php
declare(strict_types=1);
namespace Vapa\Feature;
final readonly class Field
{
    public function __construct(public string $name, public string $label, public string $type = 'text', public bool $required = false, public int $max = 255, public array|\Closure $options = [], public bool $secret = false)
    {
        if (!preg_match('/^[a-z][a-z0-9_]*$/D', $name) || !in_array($type, ['text','password','number','select','textarea'], true)) throw new \InvalidArgumentException('Invalid field definition');
    }
    public function validate(mixed $value, ?Context $ctx = null): string
    {
        if (!is_string($value) && !is_int($value)) throw new Failure($this->label.': hibás érték.');
        $v = $this->secret ? (string)$value : trim((string)$value);
        if ($this->required && $v === '') throw new Failure($this->label.': kötelező mező.');
        if (strlen($v) > $this->max || str_contains($v, "\0")) throw new Failure($this->label.': túl hosszú vagy hibás érték.');
        if ($v !== '' && $this->type === 'number' && !preg_match('/^\d+$/D', $v)) throw new Failure($this->label.': nemnegatív egész szám szükséges.');
        $options=$this->choices($ctx);
        if ($this->type==='select' && !array_key_exists($v, $options)) throw new Failure($this->label.': válassz az engedélyezett értékekből.');
        return $v;
    }
    private function choices(?Context $ctx):array { return $this->options instanceof \Closure ? ($ctx ? ($this->options)($ctx) : []) : $this->options; }
    public function metadata(?Context $ctx=null): array { return ['name'=>$this->name,'label'=>$this->label,'type'=>$this->type,'required'=>$this->required,'max'=>$this->max,'options'=>$this->choices($ctx)]; }
}
